// DinoDue D2L API probe.
//
// Checks which Brightspace (D2L) API endpoints UCalgary's D2L allows for a
// signed-in student, so we know what the extension can rely on.
//
// How to run:
//   1. Sign in at https://d2l.ucalgary.ca and stay on any D2L page.
//   2. Open DevTools (Cmd+Option+J on Mac) and go to the Console tab.
//   3. Paste this whole file and press Enter.
//   4. When it finishes, the report is copied to your clipboard.
//
// Privacy: it only sends GET requests to the D2L site you're on, using
// your own login. The report has NO names, course titles, assignment titles,
// grades or IDs. It only contains HTTP status codes, item counts, field names,
// and how often key fields (due dates, weights) are filled in. Courses are
// labelled "course 1", "course 2", etc.

(async () => {
  const ORIGIN = location.origin;
  const MAX_COURSES = 6;
  const report = { origin: ORIGIN, ranAt: new Date().toISOString(), api: {}, courses: [] };

  if (!/\/\/[^/]*d2l[^/]*\//.test(ORIGIN + "/")) {
    console.warn("This doesn't look like a D2L site. Open d2l.ucalgary.ca first.");
    return;
  }

  async function get(path) {
    try {
      const res = await fetch(ORIGIN + path, { credentials: "include", headers: { Accept: "application/json" } });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.includes("json")) return { status: res.status, json: null };
      return { status: res.status, json: await res.json() };
    } catch (e) {
      return { status: "network-error", json: null };
    }
  }

  // Describe a response without leaking its values.
  function shape(json) {
    if (json == null) return null;
    const list = Array.isArray(json) ? json
      : Array.isArray(json.Objects) ? json.Objects
      : Array.isArray(json.Items) ? json.Items
      : Array.isArray(json.Courses) ? json.Courses
      : null;
    if (!list) return { kind: "object", keys: Object.keys(json) };
    return { kind: "list", count: list.length, keys: list[0] ? Object.keys(list[0]) : [] };
  }

  function items(json) {
    if (Array.isArray(json)) return json;
    return json?.Objects ?? json?.Items ?? json?.Courses ?? [];
  }

  // Fraction of items where a field is set (not null/undefined/empty).
  function filled(list, field) {
    if (!list.length) return null;
    const n = list.filter((x) => x?.[field] != null && x[field] !== "").length;
    return `${n}/${list.length}`;
  }

  async function probe(label, path, extra) {
    const { status, json } = await get(path);
    const entry = { status, shape: shape(json) };
    if (json && extra) Object.assign(entry, extra(json));
    return [label, entry, json];
  }

  // ---- Platform-level ----
  const versions = await get("/d2l/api/versions/");
  report.api.versions = { status: versions.status };
  if (!versions.json) {
    report.error = "Couldn't read API versions. Are you signed in?";
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const latest = (code) => versions.json.find((v) => v.ProductCode === code)?.LatestVersion;
  const lp = latest("lp");
  const le = latest("le");
  report.api.versions.lp = lp;
  report.api.versions.le = le;

  const whoami = await get(`/d2l/api/lp/${lp}/users/whoami`);
  report.api.whoami = { status: whoami.status, keys: whoami.json ? Object.keys(whoami.json) : null };

  const outypes = await get(`/d2l/api/lp/${lp}/outypes/`);
  report.api.orgUnitTypes = {
    status: outypes.status,
    types: Array.isArray(outypes.json) ? outypes.json.map((t) => ({ id: t.Id, code: t.Code })) : null,
  };

  // Two ways to list courses: the documented enrollments API and the
  // internal one D2L's own homepage uses. We'll use whichever works.
  const enroll = await get(`/d2l/api/lp/${lp}/enrollments/myenrollments/?orgUnitTypeId=3`);
  const enrollItems = items(enroll.json);
  report.api.myEnrollments = {
    status: enroll.status,
    count: enrollItems.length,
    hasMorePages: enroll.json?.PagingInfo?.HasMoreItems ?? null,
    itemKeys: enrollItems[0] ? Object.keys(enrollItems[0]) : [],
    orgUnitKeys: enrollItems[0]?.OrgUnit ? Object.keys(enrollItems[0].OrgUnit) : [],
    accessKeys: enrollItems[0]?.Access ? Object.keys(enrollItems[0].Access) : [],
  };

  const mycourses = await get("/d2l/le/manageCourses/api/mycourses?pageSize=20&sort=current&orgUnitTypeId=3&embedDepth=0");
  report.api.manageCoursesMyCourses = { status: mycourses.status, shape: shape(mycourses.json) };

  // Pick current courses: accessible and inside their start/end dates when known.
  const now = Date.now();
  const inRange = (s, e) => (!s || Date.parse(s) <= now) && (!e || Date.parse(e) >= now);
  let courseIds = enrollItems
    .filter((x) => x.Access?.CanAccess !== false && inRange(x.Access?.StartDate, x.Access?.EndDate))
    .map((x) => x.OrgUnit?.Id)
    .filter(Boolean);
  if (!courseIds.length) {
    courseIds = items(mycourses.json)
      .filter((c) => c.CanAccessCourse !== false && inRange(c.StartDate, c.EndDate))
      .map((c) => Number(c.OrgUnitId))
      .filter(Boolean);
  }
  report.currentCourseCount = courseIds.length;
  courseIds = courseIds.slice(0, MAX_COURSES);

  // ---- Cross-course ----
  const start = new Date(now - 30 * 864e5).toISOString();
  const end = new Date(now + 120 * 864e5).toISOString();
  const csv = courseIds.join(",");
  report.api.calendarAllCourses = (await probe(
    "calendarAllCourses",
    `/d2l/api/le/${le}/calendar/events/myEvents/?orgUnitIdsCSV=${csv}&startDateTime=${start}&endDateTime=${end}`,
  ))[1];
  report.api.contentDueAllCourses = (await probe(
    "contentDueAllCourses",
    `/d2l/api/le/${le}/content/myItems/due/?orgUnitIdsCSV=${csv}`,
  ))[1];

  // ---- Per course ----
  for (let i = 0; i < courseIds.length; i++) {
    const ou = courseIds[i];
    const c = { course: `course ${i + 1}` };
    const run = async (label, path, extra) => {
      const [k, entry, json] = await probe(label, path, extra);
      c[k] = entry;
      return json;
    };

    const folders = await run("assignments", `/d2l/api/le/${le}/${ou}/dropbox/folders/`, (j) => ({
      dueDateFilled: filled(items(j), "DueDate"),
      gradeItemLinked: filled(items(j), "GradeItemId"),
    }));
    const firstFolder = items(folders)[0];
    if (firstFolder) {
      await run("mySubmissions", `/d2l/api/le/${le}/${ou}/dropbox/folders/${firstFolder.Id}/submissions/mysubmissions/`);
    }

    await run("quizzes", `/d2l/api/le/${le}/${ou}/quizzes/`, (j) => ({
      dueDateFilled: filled(items(j), "DueDate"),
      endDateFilled: filled(items(j), "EndDate"),
    }));

    // Grade weights are what the "what's at stake" forecast depends on.
    await run("gradeSetup", `/d2l/api/le/${le}/${ou}/grades/setup/`, (j) => ({ gradingSystem: j.GradingSystem ?? null }));
    await run("gradeItems", `/d2l/api/le/${le}/${ou}/grades/`, (j) => {
      const list = items(j);
      return {
        weightFilled: filled(list, "Weight"),
        maxPointsFilled: filled(list, "MaxPoints"),
        linkedToTool: filled(list, "AssociatedTool"),
        gradeTypes: [...new Set(list.map((x) => x.GradeType))],
      };
    });
    await run("myGradeValues", `/d2l/api/le/${le}/${ou}/grades/values/myGradeValues/`);

    await run("calendar", `/d2l/api/le/${le}/${ou}/calendar/events/myEvents/?startDateTime=${start}&endDateTime=${end}`, (j) => ({
      eventTypes: [...new Set(items(j).map((x) => x.EventType ?? x.AssociatedEntity?.AssociatedEntityType))],
    }));
    await run("contentDue", `/d2l/api/le/${le}/${ou}/content/myItems/due/`);

    const forums = await run("discussionForums", `/d2l/api/le/${le}/${ou}/discussions/forums/`);
    const firstForum = items(forums)[0];
    if (firstForum) {
      await run("discussionTopics", `/d2l/api/le/${le}/${ou}/discussions/forums/${firstForum.ForumId}/topics/`, (j) => ({
        dueDateFilled: filled(items(j), "DueDate"),
      }));
    }

    await run("checklists", `/d2l/api/le/${le}/${ou}/checklists/`);

    report.courses.push(c);
  }

  const text = JSON.stringify(report, null, 2);
  console.log(text);
  try {
    copy(text); // DevTools-only helper
    console.log("%cReport copied to clipboard. Paste it back to Claude.", "color:#D6001C;font-weight:bold");
  } catch {
    console.log("Copy the report above and paste it back to Claude.");
  }
})();
