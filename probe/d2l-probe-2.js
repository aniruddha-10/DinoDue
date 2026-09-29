// DinoDue D2L API probe, part 2.
//
// Follow-up to d2l-probe.js. Answers three questions:
//   1. How do we reliably pick this term's courses?
//   2. What are the calendar events (class schedule, or midterms/exams)?
//   3. How do grade weights work (categories), and can we match
//      assignments/quizzes to grade items by name?
//
// How to run: same as part 1. Sign in at https://d2l.ucalgary.ca, open the
// DevTools Console, paste this whole file, press Enter. The report is copied
// to your clipboard.
//
// Privacy: GET requests only, to the D2L site you're on. The report has NO
// names, course/assignment/event titles, grades or IDs. It contains counts,
// field names, term labels like "Fall 2026", D2L's own type names, and
// rounded weight totals per course. Courses are labelled "course 1", etc.

(async () => {
  const ORIGIN = location.origin;
  const MAX_COURSES = 8;
  const now = new Date();
  const report = { origin: ORIGIN, ranAt: now.toISOString() };

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
    } catch {
      return { status: "network-error", json: null };
    }
  }
  const items = (j) => (Array.isArray(j) ? j : j?.Objects ?? j?.Items ?? j?.Courses ?? []);
  const tally = (list, fn) => list.reduce((acc, x) => {
    const k = String(fn(x));
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const round1 = (n) => Math.round(n * 10) / 10;

  const versions = await get("/d2l/api/versions/");
  if (!versions.json) {
    report.error = "Couldn't read API versions. Are you signed in?";
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const latest = (code) => versions.json.find((v) => v.ProductCode === code)?.LatestVersion;
  const lp = latest("lp");
  const le = latest("le");

  // ---- 1. Picking this term's courses ----

  // Every page of the course list D2L's homepage uses.
  const byId = new Map();
  let bookmark = "";
  let pages = 0;
  do {
    const q = `?pageSize=20&sort=current&orgUnitTypeId=3&embedDepth=0${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ""}`;
    const page = await get(`/d2l/le/manageCourses/api/mycourses${q}`);
    const list = page.json?.Courses ?? [];
    for (const c of list) byId.set(String(c.OrgUnitId), c);
    pages++;
    const next = list.length ? (page.json?.Bookmark ?? "") : "";
    bookmark = next && next !== bookmark ? next : "";
  } while (bookmark && pages < 20);
  const courses = [...byId.values()];

  // Only report term labels that look like terms; anything else is "other".
  const termLabel = (s) => (s && /^(fall|winter|spring|summer)\b/i.test(s.trim()) ? s.trim() : s ? "other" : "none");
  const m = now.getMonth(); // 0 = Jan
  const season = m <= 3 ? "Winter" : m <= 5 ? "Spring" : m <= 7 ? "Summer" : "Fall";
  const currentTermGuess = `${season} ${now.getFullYear()}`;
  const t = now.getTime();
  const datedAndCurrent = (c) => c.StartDate && c.EndDate && Date.parse(c.StartDate) <= t && Date.parse(c.EndDate) >= t;
  const matchesTerm = (c) => {
    const s = (c.SemesterName ?? "").toLowerCase();
    return s.includes(season.toLowerCase()) && s.includes(String(now.getFullYear()));
  };

  report.courseList = {
    total: courses.length,
    pagesFetched: pages,
    byTerm: tally(courses, (c) => termLabel(c.SemesterName)),
    isActive: tally(courses, (c) => c.IsActive),
    canAccess: tally(courses, (c) => c.CanAccessCourse),
    hasStartAndEnd: courses.filter((c) => c.StartDate && c.EndDate).length,
    datesContainToday: courses.filter(datedAndCurrent).length,
    currentTermGuess,
    matchCurrentTerm: courses.filter(matchesTerm).length,
    matchCurrentTermAndActive: courses.filter((c) => matchesTerm(c) && c.IsActive !== false).length,
  };

  const enroll = await get(`/d2l/api/lp/${lp}/enrollments/myenrollments/?orgUnitTypeId=3`);
  const enrollItems = items(enroll.json);
  report.enrollments = {
    total: enrollItems.length,
    byType: tally(enrollItems, (x) => x.OrgUnit?.Type?.Code ?? x.OrgUnit?.Type?.Id),
    byRole: tally(enrollItems, (x) => x.Access?.ClasslistRoleName ?? "none"),
    isActive: tally(enrollItems, (x) => x.Access?.IsActive),
    hasStartAndEnd: enrollItems.filter((x) => x.Access?.StartDate && x.Access?.EndDate).length,
  };

  // Prefer the term label; fall back to real date ranges.
  let picked = courses.filter((c) => matchesTerm(c) && c.IsActive !== false && c.CanAccessCourse !== false);
  report.pickRule = "term label";
  if (!picked.length) {
    picked = courses.filter((c) => datedAndCurrent(c) && c.CanAccessCourse !== false);
    report.pickRule = "date range";
  }
  const ids = picked.map((c) => Number(c.OrgUnitId)).filter(Boolean).slice(0, MAX_COURSES);
  report.pickedCourses = ids.length;
  const label = new Map(ids.map((id, i) => [id, `course ${i + 1}`]));

  // ---- 2. Calendar events ----

  const start = new Date(t - 30 * 864e5).toISOString();
  const end = new Date(t + 120 * 864e5).toISOString();
  const KEYWORDS = {
    midterm: /mid-?term/i,
    exam: /\bexam/i,
    test: /\btest\b/i,
    quiz: /\bquiz/i,
    assignment: /assign|\bhw\b|homework|due/i,
    lecture: /lecture|\blec\b/i,
    lab: /\blab\b|laboratory/i,
    tutorial: /tutorial|\btut\b/i,
    project: /project|report|presentation/i,
  };
  function summarizeEvents(list) {
    const hours = (e) => (Date.parse(e.EndDateTime) - Date.parse(e.StartDateTime)) / 36e5;
    return {
      count: list.length,
      byEventType: tally(list, (e) => e.EventType),
      recurring: tally(list, (e) => e.IsRecurring),
      allDay: tally(list, (e) => e.IsAllDayEvent),
      linkedToTool: tally(list, (e) => e.IsAssociatedWithEntity),
      linkedToolType: tally(list.filter((e) => e.AssociatedEntity), (e) => e.AssociatedEntity.AssociatedEntityType),
      duration: tally(list, (e) => {
        const h = hours(e);
        if (e.IsAllDayEvent) return "all day";
        if (!Number.isFinite(h)) return "unknown";
        return h === 0 ? "0h (a point in time)" : h <= 2 ? "up to 2h" : h <= 4 ? "2-4h" : "over 4h";
      }),
      hasLocation: list.filter((e) => e.LocationName).length,
      distinctCourses: new Set(list.map((e) => e.OrgUnitId)).size,
      titleKeywordHits: Object.fromEntries(
        Object.entries(KEYWORDS).map(([k, re]) => [k, list.filter((e) => re.test(e.Title ?? "")).length]),
      ),
    };
  }

  const cal = await get(`/d2l/api/le/${le}/calendar/events/myEvents/?orgUnitIdsCSV=${ids.join(",")}&startDateTime=${start}&endDateTime=${end}`);
  const events = items(cal.json);
  report.calendar = { status: cal.status, all: summarizeEvents(events), byCourse: {} };
  for (const id of ids) {
    const mine = events.filter((e) => Number(e.OrgUnitId) === id);
    if (mine.length) report.calendar.byCourse[label.get(id)] = summarizeEvents(mine);
  }
  report.calendar.eventsFromUnpickedCourses = events.filter((e) => !label.has(Number(e.OrgUnitId))).length;

  // Does the per-course endpoint really stay inside its course?
  if (ids[0]) {
    const one = await get(`/d2l/api/le/${le}/${ids[0]}/calendar/events/myEvents/?startDateTime=${start}&endDateTime=${end}`);
    const list = items(one.json);
    report.calendar.perCourseEndpointCheck = {
      status: one.status,
      count: list.length,
      distinctCourses: new Set(list.map((e) => e.OrgUnitId)).size,
      allFromRequestedCourse: list.every((e) => Number(e.OrgUnitId) === ids[0]),
    };
  }

  // ---- 3. Grade weights and name matching ----

  const norm = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const tokens = (s) => new Set(norm(s).split(" ").filter(Boolean));
  function similarity(a, b) {
    const x = tokens(a);
    const y = tokens(b);
    if (!x.size || !y.size) return 0;
    let inter = 0;
    for (const w of x) if (y.has(w)) inter++;
    return inter / (x.size + y.size - inter);
  }
  function matchReport(things, nameOf, linkOf, gradeItems) {
    const r = { total: things.length, linkedById: 0, exactName: 0, closeName: 0, noMatch: 0 };
    const gradeIds = new Set(gradeItems.map((g) => g.Id));
    for (const th of things) {
      if (linkOf(th) && gradeIds.has(linkOf(th))) { r.linkedById++; continue; }
      const name = nameOf(th);
      if (gradeItems.some((g) => norm(g.Name) === norm(name) || norm(g.ShortName) === norm(name))) { r.exactName++; continue; }
      const best = Math.max(0, ...gradeItems.map((g) => similarity(g.Name, name)));
      if (best >= 0.5) r.closeName++;
      else r.noMatch++;
    }
    return r;
  }

  report.grades = {};
  for (const id of ids) {
    const g = {};
    const [setup, cats, objs, vals, folders, quizzes] = await Promise.all([
      get(`/d2l/api/le/${le}/${id}/grades/setup/`),
      get(`/d2l/api/le/${le}/${id}/grades/categories/`),
      get(`/d2l/api/le/${le}/${id}/grades/`),
      get(`/d2l/api/le/${le}/${id}/grades/values/myGradeValues/`),
      get(`/d2l/api/le/${le}/${id}/dropbox/folders/`),
      get(`/d2l/api/le/${le}/${id}/quizzes/`),
    ]);
    const catList = items(cats.json);
    const gradeItems = items(objs.json);
    const counted = (x) => !x.IsBonus && !x.ExcludeFromFinalGradeCalculation;

    g.gradingSystem = setup.json?.GradingSystem ?? null;
    g.gradeItems = gradeItems.length;
    g.categories = {
      status: cats.status,
      count: catList.length,
      keys: catList[0] ? Object.keys(catList[0]) : [],
      weightFilled: catList.filter((c) => c.Weight != null).length,
      withNestedGradesList: catList.filter((c) => Array.isArray(c.Grades)).length,
    };

    const inCategory = gradeItems.filter((x) => x.CategoryId && x.CategoryId !== 0);
    const loose = gradeItems.filter((x) => !x.CategoryId || x.CategoryId === 0);
    g.itemsInCategory = inCategory.length;
    g.itemsNotInCategory = loose.length;
    g.bonusOrExcluded = gradeItems.filter((x) => !counted(x)).length;

    // If category weights + loose item weights add to ~100, item weights
    // inside a category are relative to that category, not the course.
    const sumCats = catList.filter(counted).reduce((s, c) => s + (c.Weight ?? 0), 0);
    const sumLoose = loose.filter(counted).reduce((s, x) => s + (x.Weight ?? 0), 0);
    const sumAll = gradeItems.filter(counted).reduce((s, x) => s + (x.Weight ?? 0), 0);
    g.weightTotals = {
      categories: round1(sumCats),
      itemsNotInCategory: round1(sumLoose),
      categoriesPlusLooseItems: round1(sumCats + sumLoose),
      allItemsIgnoringCategories: round1(sumAll),
    };
    // Per category: do the item weights inside add to ~100 (relative) or to
    // the category weight (absolute)?
    g.insideCategory = catList.map((c) => {
      const inside = inCategory.filter((x) => x.CategoryId === c.Id && counted(x));
      return {
        items: inside.length,
        categoryWeight: round1(c.Weight ?? 0),
        itemWeightSum: round1(inside.reduce((s, x) => s + (x.Weight ?? 0), 0)),
        distributesEvenly: c.DistributionType ?? c.WeightDistributionType ?? null,
      };
    });

    // WeightedDenominator on a released grade = its real share of the course.
    const valList = items(vals.json);
    g.myGradeValues = {
      count: valList.length,
      byType: tally(valList, (v) => v.GradeObjectTypeName ?? v.GradeObjectType),
      weightedDenominatorFilled: valList.filter((v) => v.WeightedDenominator != null).length,
    };

    const folderList = items(folders.json);
    const quizList = items(quizzes.json);
    g.assignmentDates = {
      total: folderList.length,
      dueDate: folderList.filter((f) => f.DueDate).length,
      availabilityEndOnly: folderList.filter((f) => !f.DueDate && f.Availability?.EndDate).length,
      noDate: folderList.filter((f) => !f.DueDate && !f.Availability?.EndDate).length,
      hidden: folderList.filter((f) => f.IsHidden).length,
      hasScoreOutOf: folderList.filter((f) => f.Assessment?.ScoreDenominator != null).length,
    };
    g.matchAssignments = matchReport(folderList, (f) => f.Name, (f) => f.GradeItemId, gradeItems);
    g.matchQuizzes = matchReport(quizList, (q) => q.Name, (q) => q.GradeItemId, gradeItems);

    report.grades[label.get(id)] = g;
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
