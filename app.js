(function () {
  const STORE_KEY = "teacher-hours-stat-v1";
  const DATA_VERSION = 2;
  const app = document.getElementById("app");

  const LESSONS = [
    { id: "p1", group: "regular", name: "正课第一节", time: "08:00-08:45" },
    { id: "p2", group: "regular", name: "正课第二节", time: "08:55-09:40" },
    { id: "p3", group: "regular", name: "正课第三节", time: "10:00-10:45" },
    { id: "p4", group: "regular", name: "正课第四节", time: "10:55-11:40" },
    { id: "p5", group: "regular", name: "正课第五节", time: "14:00-14:45" },
    { id: "p6", group: "regular", name: "正课第六节", time: "14:55-15:40" },
    { id: "p7", group: "regular", name: "正课第七节", time: "16:00-16:45" },
    { id: "p8", group: "regular", name: "正课第八节", time: "16:55-17:40" },
    { id: "e1", group: "evening", name: "晚自习第一节", time: "18:30-19:10" },
    { id: "e2", group: "evening", name: "晚自习第二节", time: "19:20-20:00" },
    { id: "e3", group: "evening", name: "晚自习第三节", time: "20:10-20:50" },
    { id: "e4", group: "evening", name: "晚自习第四节", time: "21:00-21:40" },
  ];

  const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
  const DEFAULT_ACTIVE_LESSON_IDS = LESSONS.map((lesson) => lesson.id);

  let state = loadState();

  function createInitialState() {
    const now = new Date();
    const today = formatDate(now);
    const teachers = [
      {
        id: createId("t"),
        role: "teacher",
        username: "wang",
        password: "123456",
        name: "王老师",
      },
      {
        id: createId("t"),
        role: "teacher",
        username: "li",
        password: "123456",
        name: "李老师",
      },
    ];

    return {
      version: DATA_VERSION,
      activeUserId: null,
      selectedDate: today,
      calendarYear: now.getFullYear(),
      calendarMonth: now.getMonth(),
      teacherRange: "day",
      adminDate: today,
      adminFocusTeacherId: null,
      message: null,
      users: [
        {
          id: "admin",
          role: "admin",
          username: "admin",
          password: "admin123",
          name: "管理员",
        },
        ...teachers,
      ],
      dailyPlans: {},
      records: {},
    };
  }

  function makeRecord(teacher) {
    return {
      id: createId("r"),
      teacherId: teacher.id,
      teacherName: teacher.name,
      updatedAt: new Date().toISOString(),
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return createInitialState();
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      console.warn("Failed to load state", error);
      return createInitialState();
    }
  }

  function normalizeState(input) {
    const base = createInitialState();
    const loaded = input && typeof input === "object" ? input : {};
    const users = Array.isArray(loaded.users) && loaded.users.length ? loaded.users : base.users;
    const normalized = {
      ...base,
      ...loaded,
      version: DATA_VERSION,
      users,
      dailyPlans: normalizeDailyPlans(loaded.dailyPlans),
      records: normalizeRecords(loaded.records, loaded.version, users),
      message: null,
    };

    if (!normalized.adminDate) normalized.adminDate = base.adminDate;
    if (!normalized.selectedDate) normalized.selectedDate = base.selectedDate;
    if (!["day", "month", "year"].includes(normalized.teacherRange)) normalized.teacherRange = "day";
    if (normalized.adminFocusTeacherId && !users.some((user) => user.id === normalized.adminFocusTeacherId)) {
      normalized.adminFocusTeacherId = null;
    }

    return normalized;
  }

  function normalizeDailyPlans(plans) {
    const validIds = new Set(DEFAULT_ACTIVE_LESSON_IDS);
    const normalized = {};

    Object.entries(plans || {}).forEach(([dateKey, plan]) => {
      if (!plan || !Array.isArray(plan.activeLessonIds)) return;
      const activeLessonIds = LESSONS.filter((lesson) => plan.activeLessonIds.includes(lesson.id) && validIds.has(lesson.id)).map(
        (lesson) => lesson.id
      );
      normalized[dateKey] = { activeLessonIds };
    });

    return normalized;
  }

  function normalizeRecords(records, version, users) {
    const teachersById = new Map(users.filter((user) => user.role === "teacher").map((teacher) => [teacher.id, teacher]));
    const validLessonIds = new Set(DEFAULT_ACTIVE_LESSON_IDS);
    const shouldMapLegacyEvening = version !== DATA_VERSION;
    const normalized = {};

    Object.entries(records || {}).forEach(([dateKey, lessons]) => {
      if (!lessons || typeof lessons !== "object") return;
      Object.entries(lessons).forEach(([lessonId, value]) => {
        const targetLessonId = shouldMapLegacyEvening && lessonId === "p8" ? "e1" : lessonId;
        if (!validLessonIds.has(targetLessonId)) return;

        const entries = Array.isArray(value) ? value : value && value.teacherId ? [value] : [];
        entries.forEach((entry) => {
          if (!entry || !entry.teacherId) return;
          const teacher = teachersById.get(entry.teacherId);
          if (!teacher) return;
          if (!normalized[dateKey]) normalized[dateKey] = {};
          if (!normalized[dateKey][targetLessonId]) normalized[dateKey][targetLessonId] = [];
          normalized[dateKey][targetLessonId].push({
            id: entry.id || createId("r"),
            teacherId: teacher.id,
            teacherName: teacher.name,
            updatedAt: entry.updatedAt || new Date().toISOString(),
          });
        });
      });
    });

    return normalized;
  }

  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...state, version: DATA_VERSION, message: null }));
  }

  function render() {
    const user = getActiveUser();
    app.innerHTML = user ? renderApp(user) : renderLogin();
  }

  function renderLogin() {
    const messageHtml = renderMessage();
    return `
      <main class="login-screen">
        <section class="login-panel">
          <div class="brand-row">
            <div class="brand-mark">课</div>
            <div>
              <h1>教师课时统计</h1>
              <p>${formatDate(new Date())}</p>
            </div>
          </div>
          <form id="login-form" class="field-stack">
            <label class="field">
              <span>账号</span>
              <input name="username" autocomplete="username" required />
            </label>
            <label class="field">
              <span>密码</span>
              <input name="password" type="password" autocomplete="current-password" required />
            </label>
            <button class="btn primary" type="submit">登录</button>
          </form>
          ${messageHtml}
          <div class="helper-box">
            <strong>默认账号</strong>
            <span>管理员：admin / admin123</span>
            <span>教师：wang / 123456，li / 123456</span>
          </div>
        </section>
      </main>
    `;
  }

  function renderApp(user) {
    const roleName = user.role === "admin" ? "管理员" : "教师";
    return `
      <div class="app-shell">
        <header class="app-topbar">
          <div class="topbar-title">
            <div class="brand-mark">课</div>
            <div>
              <h1>${escapeHtml(user.name)}</h1>
              <span class="role-pill">${roleName}</span>
            </div>
          </div>
          <div class="toolbar">
            <button class="btn ghost" data-action="logout" type="button">退出登录</button>
          </div>
        </header>
        <main class="content">
          ${user.role === "admin" ? renderAdmin() : renderTeacher(user)}
        </main>
      </div>
    `;
  }

  function renderTeacher(user) {
    const selected = parseDateKey(state.selectedDate);
    const dayCount = countTeacherForDay(user.id, state.selectedDate);
    const monthCount = countTeacherForMonth(user.id, selected.year, selected.month - 1);
    const yearCount = countTeacherForYear(user.id, selected.year);

    return `
      <div class="stats-grid">
        ${renderStat("当天课时", dayCount, formatDateLabel(state.selectedDate))}
        ${renderStat("当月课时", monthCount, `${selected.year}年${selected.month}月`)}
        ${renderStat("当年课时", yearCount, `${selected.year}年`)}
      </div>
      ${renderMessage()}
      <div class="grid-main">
        <section class="panel">
          <div class="panel-header">
            <h2>日历</h2>
            <div class="toolbar">
              <button class="icon-btn" data-action="prev-month" aria-label="上个月" title="上个月" type="button">‹</button>
              <div class="month-title">${state.calendarYear}年${state.calendarMonth + 1}月</div>
              <button class="icon-btn" data-action="next-month" aria-label="下个月" title="下个月" type="button">›</button>
              <button class="btn ghost" data-action="today" type="button">今天</button>
            </div>
          </div>
          <div class="panel-body">
            ${renderCalendar(user.id)}
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>${formatDateLabel(state.selectedDate)}</h2>
            <div class="segmented" role="group" aria-label="统计范围">
              ${renderRangeButton("day", "日")}
              ${renderRangeButton("month", "月")}
              ${renderRangeButton("year", "年")}
            </div>
          </div>
          <div class="panel-body">
            ${renderSchedule(user)}
            ${renderTeacherRange(user)}
            ${renderPasswordForm()}
          </div>
        </section>
      </div>
    `;
  }

  function renderRangeButton(range, label) {
    const active = state.teacherRange === range ? "active" : "";
    return `<button class="${active}" data-action="set-range" data-range="${range}" type="button">${label}</button>`;
  }

  function renderStat(label, value, note) {
    return `
      <section class="stat-card">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${value}</div>
        <div class="stat-note">${escapeHtml(note)}</div>
      </section>
    `;
  }

  function renderCalendar(teacherId) {
    const cells = getCalendarCells(state.calendarYear, state.calendarMonth);
    const today = formatDate(new Date());

    return `
      <div class="calendar-grid">
        ${WEEKDAYS.map((day) => `<div class="weekday">${day}</div>`).join("")}
        ${cells
          .map((cell) => {
            const classes = [
              "day-cell",
              cell.inMonth ? "" : "muted",
              cell.key === today ? "today" : "",
              cell.key === state.selectedDate ? "selected" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const count = countTeacherForDay(teacherId, cell.key);
            return `
              <button class="${classes}" data-action="select-date" data-date="${cell.key}" type="button">
                <span class="day-number">${cell.date.getDate()}</span>
                <span class="day-count">${count ? `${count}课时` : "无课时"}</span>
              </button>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderSchedule(user) {
    const lessons = getActiveLessons(state.selectedDate);
    if (!lessons.length) {
      return `<div class="empty-panel">当天未设置课时</div>`;
    }

    const rows = lessons
      .map((lesson) => {
        const entries = getEntries(state.selectedDate, lesson.id);
        const teacherCount = countTeacherForSlot(user.id, state.selectedDate, lesson.id);
        const teacherText = entries.length ? renderEntrySummary(entries) : `<span class="empty-text">未登记</span>`;
        const removeButton = teacherCount
          ? `<button class="btn danger" data-action="remove-own-entry" data-date="${state.selectedDate}" data-slot="${lesson.id}" type="button">撤销一次(${teacherCount})</button>`
          : "";

        return `
          <div class="lesson-row">
            <div class="lesson-time">
              <strong>${lesson.name}</strong>
              <span>${lesson.time}</span>
            </div>
            <div class="lesson-teacher">${teacherText}</div>
            <div class="inline-actions">
              <button class="btn primary" data-action="add-own-entry" data-date="${state.selectedDate}" data-slot="${lesson.id}" type="button">登记一次</button>
              ${removeButton}
            </div>
          </div>
        `;
      })
      .join("");

    return `<div class="schedule-list">${rows}</div>`;
  }

  function renderTeacherRange(user) {
    const selected = parseDateKey(state.selectedDate);
    let title = "";
    let rows = [];

    if (state.teacherRange === "day") {
      title = `${formatDateLabel(state.selectedDate)}明细`;
      rows = getActiveLessons(state.selectedDate).map((lesson) => ({
        label: `${lesson.name} ${lesson.time}`,
        count: countTeacherForSlot(user.id, state.selectedDate, lesson.id),
      }));
    }

    if (state.teacherRange === "month") {
      title = `${selected.year}年${selected.month}月统计`;
      rows = getDatesInMonth(selected.year, selected.month - 1).map((key) => ({
        label: formatDateLabel(key),
        count: countTeacherForDay(user.id, key),
      }));
    }

    if (state.teacherRange === "year") {
      title = `${selected.year}年统计`;
      rows = Array.from({ length: 12 }, (_, index) => ({
        label: `${selected.year}年${index + 1}月`,
        count: countTeacherForMonth(user.id, selected.year, index),
      }));
    }

    return `
      <section class="admin-section summary-section">
        <h3 class="section-title">${title}</h3>
        <div class="summary-list">
          ${rows.length ? rows.map(renderSummaryRow).join("") : `<div class="empty-panel">暂无课时</div>`}
        </div>
      </section>
    `;
  }

  function renderSummaryRow(row) {
    return `
      <div class="summary-row">
        <strong>${escapeHtml(row.label)}</strong>
        <span class="count-badge">${row.count}</span>
      </div>
    `;
  }

  function renderPasswordForm() {
    return `
      <section class="admin-section summary-section">
        <h3 class="section-title">修改密码</h3>
        <form id="change-password-form" class="password-grid">
          <label class="field">
            <span>当前密码</span>
            <input name="currentPassword" type="password" autocomplete="current-password" required />
          </label>
          <label class="field">
            <span>新密码</span>
            <input name="newPassword" type="password" autocomplete="new-password" required minlength="4" maxlength="32" />
          </label>
          <label class="field">
            <span>确认新密码</span>
            <input name="confirmPassword" type="password" autocomplete="new-password" required minlength="4" maxlength="32" />
          </label>
          <button class="btn primary" type="submit">保存密码</button>
        </form>
      </section>
    `;
  }

  function renderAdmin() {
    const selected = parseDateKey(state.adminDate);
    const teacherList = getTeachers();
    const totalDay = countAllForDay(state.adminDate);
    const totalMonth = countAllForMonth(selected.year, selected.month - 1);
    const totalYear = countAllForYear(selected.year);
    const focusedTeacher = state.adminFocusTeacherId ? teacherList.find((teacher) => teacher.id === state.adminFocusTeacherId) : null;

    if (state.adminFocusTeacherId && !focusedTeacher) state.adminFocusTeacherId = null;

    return `
      <div class="stats-grid">
        ${renderStat("教师数量", teacherList.length, "账号总数")}
        ${renderStat("当天总课时", totalDay, formatDateLabel(state.adminDate))}
        ${renderStat("当月总课时", totalMonth, `${selected.year}年${selected.month}月`)}
        ${renderStat("当年总课时", totalYear, `${selected.year}年`)}
      </div>
      ${renderMessage()}
      <div class="admin-grid">
        <section class="panel">
          <div class="panel-header">
            <h2>教师管理</h2>
          </div>
          <div class="panel-body admin-section">
            ${renderAddTeacherForm()}
            ${renderTeacherTable()}
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>${focusedTeacher ? `${escapeHtml(focusedTeacher.name)}课时管理` : "课时管理"}</h2>
            <label class="field admin-date-field">
              <span>日期</span>
              <input name="adminDate" class="compact-input" type="date" value="${state.adminDate}" data-action="admin-date" />
            </label>
          </div>
          <div class="panel-body admin-section">
            ${renderDailyPlanEditor()}
            ${focusedTeacher ? renderAdminTeacherEditor(focusedTeacher) : renderAdminRecordEditor()}
            ${renderAdminReport(totalDay)}
          </div>
        </section>
      </div>
    `;
  }

  function renderAddTeacherForm() {
    return `
      <form id="add-teacher-form" class="form-grid">
        <label class="field">
          <span>姓名</span>
          <input name="name" required maxlength="20" />
        </label>
        <label class="field">
          <span>账号</span>
          <input name="username" required maxlength="24" />
        </label>
        <label class="field">
          <span>密码</span>
          <input name="password" required maxlength="32" />
        </label>
        <button class="btn primary" type="submit">新增教师</button>
      </form>
    `;
  }

  function renderTeacherTable() {
    const rows = getTeachers()
      .map(
        (teacher) => `
          <tr>
            <td colspan="4">
              <form class="teacher-edit-row edit-teacher-form" data-teacher-id="${teacher.id}">
                <input class="compact-input" name="name" value="${escapeAttr(teacher.name)}" required maxlength="20" aria-label="教师姓名" />
                <input class="compact-input" name="username" value="${escapeAttr(teacher.username)}" required maxlength="24" aria-label="教师账号" />
                <input class="compact-input" name="password" value="${escapeAttr(teacher.password)}" required maxlength="32" aria-label="教师密码" />
                <button class="btn" type="submit">保存</button>
                <button class="btn danger" data-action="delete-teacher" data-teacher-id="${teacher.id}" type="button">删除</button>
              </form>
            </td>
          </tr>
        `
      )
      .join("");

    return `
      <div class="table-wrap">
        <table class="teacher-table">
          <thead>
            <tr>
              <th>姓名 / 账号 / 密码 / 操作</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td>暂无教师</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderDailyPlanEditor() {
    const counts = getDayLessonCounts(state.adminDate);
    const activeIds = new Set(getDayPlan(state.adminDate).activeLessonIds);

    return `
      <section class="plan-editor">
        <div class="section-title-row">
          <h3 class="section-title">当天课节设置</h3>
          <span class="muted-text">默认正课8节，晚自习4节</span>
        </div>
        <form id="day-count-form" class="plan-count-grid">
          <label class="field">
            <span>正课节数</span>
            <input class="compact-input" name="regularCount" type="number" min="0" max="8" value="${counts.regular}" required />
          </label>
          <label class="field">
            <span>晚自习节数</span>
            <input class="compact-input" name="eveningCount" type="number" min="0" max="4" value="${counts.evening}" required />
          </label>
          <button class="btn primary" type="submit">批量设置</button>
          <button class="btn ghost" data-action="reset-day-plan" type="button">恢复默认</button>
        </form>
        <div class="lesson-toggle-grid">
          ${LESSONS.map((lesson) => {
            const checked = activeIds.has(lesson.id) ? "checked" : "";
            return `
              <label class="lesson-toggle">
                <input type="checkbox" data-action="toggle-lesson-active" data-slot="${lesson.id}" ${checked} />
                <span>
                  <strong>${lesson.name}</strong>
                  <small>${lesson.time}</small>
                </span>
              </label>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function renderAdminRecordEditor() {
    const lessons = getActiveLessons(state.adminDate);
    if (!lessons.length) {
      return `<div class="empty-panel">当天未设置课时，先在上方设置课节。</div>`;
    }

    const rows = lessons
      .map((lesson) => {
        const entries = getEntries(state.adminDate, lesson.id);
        return `
          <div class="admin-lesson-row">
            <div class="lesson-time">
              <strong>${lesson.name}</strong>
              <span>${lesson.time}</span>
            </div>
            <div class="admin-slot-tools">
              ${renderEntryList(entries, state.adminDate, lesson.id)}
              ${renderAdminAddEntryForm(lesson.id)}
            </div>
          </div>
        `;
      })
      .join("");

    return `
      <section class="admin-section">
        <h3 class="section-title">全体课时登记</h3>
        <div class="record-editor">${rows}</div>
      </section>
    `;
  }

  function renderAdminAddEntryForm(lessonId) {
    const teachers = getTeachers();
    const options = teachers.map((teacher) => `<option value="${teacher.id}">${escapeHtml(teacher.name)}</option>`).join("");

    if (!teachers.length) {
      return `<div class="empty-text">暂无教师账号</div>`;
    }

    return `
      <form class="admin-add-entry-form mini-form" data-slot="${lessonId}">
        <select class="compact-select" name="teacherId" aria-label="选择教师" required>
          ${options}
        </select>
        <button class="btn" type="submit">添加一次</button>
      </form>
    `;
  }

  function renderEntryList(entries, dateKey, lessonId) {
    if (!entries.length) return `<div class="empty-text">未登记</div>`;

    return `
      <div class="entry-list">
        ${entries
          .map(
            (entry) => `
              <span class="entry-chip">
                ${escapeHtml(entry.teacherName)}
                <button data-action="remove-entry" data-date="${dateKey}" data-slot="${lessonId}" data-entry-id="${entry.id}" type="button" aria-label="删除登记">×</button>
              </span>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderAdminTeacherEditor(teacher) {
    const selected = parseDateKey(state.adminDate);
    const lessons = getActiveLessons(state.adminDate);
    const rows = lessons
      .map((lesson) => {
        const count = countTeacherForSlot(teacher.id, state.adminDate, lesson.id);
        return `
          <form class="teacher-slot-count-form admin-lesson-row" data-teacher-id="${teacher.id}" data-slot="${lesson.id}">
            <div class="lesson-time">
              <strong>${lesson.name}</strong>
              <span>${lesson.time}</span>
            </div>
            <div class="mini-form">
              <input class="compact-input compact-number" name="count" type="number" min="0" max="30" value="${count}" aria-label="课时次数" required />
              <button class="btn" type="submit">保存</button>
            </div>
          </form>
        `;
      })
      .join("");

    return `
      <section class="admin-section">
        <div class="section-title-row">
          <h3 class="section-title">${escapeHtml(teacher.name)}：${formatDateLabel(state.adminDate)}</h3>
          <button class="btn ghost" data-action="clear-focus-teacher" type="button">返回全体</button>
        </div>
        <div class="stats-grid slim-stats">
          ${renderStat("当天", countTeacherForDay(teacher.id, state.adminDate), formatDateLabel(state.adminDate))}
          ${renderStat("当月", countTeacherForMonth(teacher.id, selected.year, selected.month - 1), `${selected.year}年${selected.month}月`)}
          ${renderStat("当年", countTeacherForYear(teacher.id, selected.year), `${selected.year}年`)}
        </div>
        <div class="record-editor">
          ${rows || `<div class="empty-panel">当天未设置课时，先在上方设置课节。</div>`}
        </div>
      </section>
    `;
  }

  function renderAdminReport(totalDay) {
    const selected = parseDateKey(state.adminDate);
    const rows = getTeachers()
      .map((teacher) => {
        const day = countTeacherForDay(teacher.id, state.adminDate);
        const month = countTeacherForMonth(teacher.id, selected.year, selected.month - 1);
        const year = countTeacherForYear(teacher.id, selected.year);
        const total = countTeacherTotal(teacher.id);
        const activeClass = state.adminFocusTeacherId === teacher.id ? "active-row" : "";
        return `
          <tr class="${activeClass}">
            <td>
              <button class="link-button" data-action="focus-teacher" data-teacher-id="${teacher.id}" type="button">${escapeHtml(teacher.name)}</button>
            </td>
            <td>${day}</td>
            <td>${month}</td>
            <td>${year}</td>
            <td>${total}</td>
            <td>
              <button class="btn ghost" data-action="focus-teacher" data-teacher-id="${teacher.id}" type="button">单独管理</button>
            </td>
          </tr>
        `;
      })
      .join("");

    return `
      <section class="admin-section">
        <h3 class="section-title">${formatDateLabel(state.adminDate)}：共 ${totalDay} 课时</h3>
        <div class="table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>教师</th>
                <th>当天</th>
                <th>当月</th>
                <th>当年</th>
                <th>全部</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="6">暂无教师</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderEntrySummary(entries) {
    const groups = new Map();
    entries.forEach((entry) => {
      const current = groups.get(entry.teacherId) || { name: entry.teacherName, count: 0 };
      current.count += 1;
      groups.set(entry.teacherId, current);
    });

    return Array.from(groups.values())
      .map((group) => `${escapeHtml(group.name)} × ${group.count}`)
      .join("、");
  }

  function renderMessage() {
    if (!state.message) return "";
    return `<div class="notice ${state.message.type}">${escapeHtml(state.message.text)}</div>`;
  }

  function getActiveUser() {
    if (!state.activeUserId) return null;
    return state.users.find((user) => user.id === state.activeUserId) || null;
  }

  function getTeachers() {
    return state.users.filter((user) => user.role === "teacher");
  }

  function getDayPlan(dateKey) {
    const plan = state.dailyPlans[dateKey];
    if (!plan || !Array.isArray(plan.activeLessonIds)) {
      return { activeLessonIds: [...DEFAULT_ACTIVE_LESSON_IDS] };
    }
    const activeLessonIds = LESSONS.filter((lesson) => plan.activeLessonIds.includes(lesson.id)).map((lesson) => lesson.id);
    return { activeLessonIds };
  }

  function getActiveLessons(dateKey) {
    const activeIds = new Set(getDayPlan(dateKey).activeLessonIds);
    return LESSONS.filter((lesson) => activeIds.has(lesson.id));
  }

  function isLessonActive(dateKey, lessonId) {
    return getDayPlan(dateKey).activeLessonIds.includes(lessonId);
  }

  function getDayLessonCounts(dateKey) {
    const activeIds = new Set(getDayPlan(dateKey).activeLessonIds);
    return {
      regular: LESSONS.filter((lesson) => lesson.group === "regular" && activeIds.has(lesson.id)).length,
      evening: LESSONS.filter((lesson) => lesson.group === "evening" && activeIds.has(lesson.id)).length,
    };
  }

  function setDayCounts(dateKey, regularCount, eveningCount) {
    const regularLimit = LESSONS.filter((lesson) => lesson.group === "regular").length;
    const eveningLimit = LESSONS.filter((lesson) => lesson.group === "evening").length;
    const safeRegular = clampNumber(regularCount, 0, regularLimit);
    const safeEvening = clampNumber(eveningCount, 0, eveningLimit);
    const activeLessonIds = [
      ...LESSONS.filter((lesson) => lesson.group === "regular").slice(0, safeRegular).map((lesson) => lesson.id),
      ...LESSONS.filter((lesson) => lesson.group === "evening").slice(0, safeEvening).map((lesson) => lesson.id),
    ];
    state.dailyPlans[dateKey] = { activeLessonIds };
  }

  function setLessonActive(dateKey, lessonId, active) {
    const activeIds = new Set(getDayPlan(dateKey).activeLessonIds);
    if (active) {
      activeIds.add(lessonId);
    } else {
      activeIds.delete(lessonId);
    }
    state.dailyPlans[dateKey] = {
      activeLessonIds: LESSONS.filter((lesson) => activeIds.has(lesson.id)).map((lesson) => lesson.id),
    };
  }

  function resetDayPlan(dateKey) {
    delete state.dailyPlans[dateKey];
  }

  function getEntries(dateKey, lessonId) {
    const entries = state.records[dateKey] && state.records[dateKey][lessonId] ? state.records[dateKey][lessonId] : [];
    return Array.isArray(entries) ? entries : [];
  }

  function addRecord(dateKey, lessonId, teacherId) {
    const teacher = state.users.find((user) => user.id === teacherId && user.role === "teacher");
    if (!teacher) return;
    if (!state.records[dateKey]) state.records[dateKey] = {};
    if (!state.records[dateKey][lessonId]) state.records[dateKey][lessonId] = [];
    state.records[dateKey][lessonId].push(makeRecord(teacher));
  }

  function removeEntry(dateKey, lessonId, entryId) {
    const entries = getEntries(dateKey, lessonId);
    state.records[dateKey][lessonId] = entries.filter((entry) => entry.id !== entryId);
    pruneEmptyRecords(dateKey, lessonId);
  }

  function removeTeacherEntry(dateKey, lessonId, teacherId) {
    const entries = getEntries(dateKey, lessonId);
    const index = entries.map((entry) => entry.teacherId).lastIndexOf(teacherId);
    if (index < 0) return;
    entries.splice(index, 1);
    state.records[dateKey][lessonId] = entries;
    pruneEmptyRecords(dateKey, lessonId);
  }

  function setTeacherLessonCount(dateKey, lessonId, teacherId, count) {
    const safeCount = clampNumber(count, 0, 30);
    const entries = getEntries(dateKey, lessonId).filter((entry) => entry.teacherId !== teacherId);
    const teacher = state.users.find((user) => user.id === teacherId && user.role === "teacher");
    if (!teacher) return;

    if (!state.records[dateKey]) state.records[dateKey] = {};
    state.records[dateKey][lessonId] = entries;
    for (let index = 0; index < safeCount; index += 1) {
      state.records[dateKey][lessonId].push(makeRecord(teacher));
    }
    pruneEmptyRecords(dateKey, lessonId);
  }

  function pruneEmptyRecords(dateKey, lessonId) {
    if (!state.records[dateKey]) return;
    if (lessonId && state.records[dateKey][lessonId] && state.records[dateKey][lessonId].length === 0) {
      delete state.records[dateKey][lessonId];
    }
    if (Object.keys(state.records[dateKey]).length === 0) {
      delete state.records[dateKey];
    }
  }

  function countTeacherTotal(teacherId) {
    return countRecords((entry) => entry.teacherId === teacherId);
  }

  function countTeacherForDay(teacherId, dateKey) {
    return countRecords((entry, recordDate) => recordDate === dateKey && entry.teacherId === teacherId);
  }

  function countTeacherForSlot(teacherId, dateKey, lessonId) {
    return countRecords((entry, recordDate, recordLessonId) => {
      return recordDate === dateKey && recordLessonId === lessonId && entry.teacherId === teacherId;
    });
  }

  function countTeacherForMonth(teacherId, year, monthIndex) {
    return countRecords((entry, recordDate) => {
      const parsed = parseDateKey(recordDate);
      return parsed.year === year && parsed.month === monthIndex + 1 && entry.teacherId === teacherId;
    });
  }

  function countTeacherForYear(teacherId, year) {
    return countRecords((entry, recordDate) => {
      const parsed = parseDateKey(recordDate);
      return parsed.year === year && entry.teacherId === teacherId;
    });
  }

  function countAllForDay(dateKey) {
    return countRecords((entry, recordDate) => recordDate === dateKey && Boolean(entry.teacherId));
  }

  function countAllForMonth(year, monthIndex) {
    return countRecords((entry, recordDate) => {
      const parsed = parseDateKey(recordDate);
      return parsed.year === year && parsed.month === monthIndex + 1 && Boolean(entry.teacherId);
    });
  }

  function countAllForYear(year) {
    return countRecords((entry, recordDate) => parseDateKey(recordDate).year === year && Boolean(entry.teacherId));
  }

  function countRecords(predicate) {
    let count = 0;
    Object.entries(state.records).forEach(([recordDate, lessons]) => {
      Object.entries(lessons).forEach(([lessonId, entries]) => {
        if (!isLessonActive(recordDate, lessonId)) return;
        entries.forEach((entry) => {
          if (predicate(entry, recordDate, lessonId)) count += 1;
        });
      });
    });
    return count;
  }

  function getCalendarCells(year, monthIndex) {
    const first = new Date(year, monthIndex, 1);
    const start = new Date(year, monthIndex, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return {
        date,
        key: formatDate(date),
        inMonth: date.getMonth() === monthIndex,
      };
    });
  }

  function getDatesInMonth(year, monthIndex) {
    const count = new Date(year, monthIndex + 1, 0).getDate();
    return Array.from({ length: count }, (_, index) => formatDate(new Date(year, monthIndex, index + 1)));
  }

  function parseDateKey(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return { year, month, day };
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDateLabel(dateKey) {
    const parsed = parseDateKey(dateKey);
    return `${parsed.year}年${parsed.month}月${parsed.day}日`;
  }

  function createId(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  }

  function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function setMessage(type, text) {
    state.message = { type, text };
  }

  function clearMessage() {
    state.message = null;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  app.addEventListener("submit", (event) => {
    const form = event.target;

    if (form.id === "login-form") {
      event.preventDefault();
      const data = new FormData(form);
      const username = String(data.get("username")).trim();
      const password = String(data.get("password")).trim();
      const user = state.users.find((item) => item.username === username && item.password === password);

      if (!user) {
        setMessage("error", "账号或密码不正确");
        saveState();
        render();
        return;
      }

      state.activeUserId = user.id;
      clearMessage();
      saveState();
      render();
      return;
    }

    if (form.id === "add-teacher-form") {
      event.preventDefault();
      const data = new FormData(form);
      const name = String(data.get("name")).trim();
      const username = String(data.get("username")).trim();
      const password = String(data.get("password")).trim();

      if (!name || !username || !password) {
        setMessage("error", "请填写完整教师信息");
        render();
        return;
      }

      if (state.users.some((user) => user.username === username)) {
        setMessage("error", "账号已存在");
        render();
        return;
      }

      state.users.push({
        id: createId("t"),
        role: "teacher",
        name,
        username,
        password,
      });
      setMessage("ok", "教师已新增");
      saveState();
      render();
      return;
    }

    if (form.id === "change-password-form") {
      event.preventDefault();
      const activeUser = getActiveUser();
      if (!activeUser || activeUser.role !== "teacher") return;

      const data = new FormData(form);
      const currentPassword = String(data.get("currentPassword"));
      const newPassword = String(data.get("newPassword"));
      const confirmPassword = String(data.get("confirmPassword"));

      if (currentPassword !== activeUser.password) {
        setMessage("error", "当前密码不正确");
        render();
        return;
      }

      if (newPassword.length < 4) {
        setMessage("error", "新密码至少需要4位");
        render();
        return;
      }

      if (newPassword !== confirmPassword) {
        setMessage("error", "两次输入的新密码不一致");
        render();
        return;
      }

      activeUser.password = newPassword;
      setMessage("ok", "密码已修改");
      saveState();
      render();
      return;
    }

    if (form.id === "day-count-form") {
      event.preventDefault();
      const data = new FormData(form);
      setDayCounts(state.adminDate, data.get("regularCount"), data.get("eveningCount"));
      setMessage("ok", "当天课节已批量设置");
      saveState();
      render();
      return;
    }

    if (form.classList.contains("admin-add-entry-form")) {
      event.preventDefault();
      const data = new FormData(form);
      const teacherId = String(data.get("teacherId"));
      addRecord(state.adminDate, form.dataset.slot, teacherId);
      setMessage("ok", "已添加一次课时");
      saveState();
      render();
      return;
    }

    if (form.classList.contains("teacher-slot-count-form")) {
      event.preventDefault();
      const data = new FormData(form);
      setTeacherLessonCount(state.adminDate, form.dataset.slot, form.dataset.teacherId, data.get("count"));
      setMessage("ok", "教师课时已保存");
      saveState();
      render();
      return;
    }

    if (form.classList.contains("edit-teacher-form")) {
      event.preventDefault();
      const teacherId = form.dataset.teacherId;
      const teacher = state.users.find((user) => user.id === teacherId);
      if (!teacher) return;

      const data = new FormData(form);
      const name = String(data.get("name")).trim();
      const username = String(data.get("username")).trim();
      const password = String(data.get("password")).trim();

      if (!name || !username || !password) {
        setMessage("error", "请填写完整教师信息");
        render();
        return;
      }

      const duplicate = state.users.some((user) => user.id !== teacherId && user.username === username);
      if (duplicate) {
        setMessage("error", "账号已存在");
        render();
        return;
      }

      teacher.name = name;
      teacher.username = username;
      teacher.password = password;

      Object.values(state.records).forEach((lessons) => {
        Object.values(lessons).forEach((entries) => {
          entries.forEach((entry) => {
            if (entry.teacherId === teacherId) entry.teacherName = name;
          });
        });
      });

      setMessage("ok", "教师信息已保存");
      saveState();
      render();
    }
  });

  app.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    const action = target.dataset.action;
    const activeUser = getActiveUser();

    if (action === "logout") {
      state.activeUserId = null;
      clearMessage();
      saveState();
      render();
      return;
    }

    if (action === "prev-month") {
      const date = new Date(state.calendarYear, state.calendarMonth - 1, 1);
      state.calendarYear = date.getFullYear();
      state.calendarMonth = date.getMonth();
      saveState();
      render();
      return;
    }

    if (action === "next-month") {
      const date = new Date(state.calendarYear, state.calendarMonth + 1, 1);
      state.calendarYear = date.getFullYear();
      state.calendarMonth = date.getMonth();
      saveState();
      render();
      return;
    }

    if (action === "today") {
      const now = new Date();
      state.selectedDate = formatDate(now);
      state.calendarYear = now.getFullYear();
      state.calendarMonth = now.getMonth();
      saveState();
      render();
      return;
    }

    if (action === "select-date") {
      const parsed = parseDateKey(target.dataset.date);
      state.selectedDate = target.dataset.date;
      state.calendarYear = parsed.year;
      state.calendarMonth = parsed.month - 1;
      saveState();
      render();
      return;
    }

    if (action === "set-range") {
      state.teacherRange = target.dataset.range;
      saveState();
      render();
      return;
    }

    if (action === "add-own-entry" && activeUser && activeUser.role === "teacher") {
      addRecord(target.dataset.date, target.dataset.slot, activeUser.id);
      saveState();
      render();
      return;
    }

    if (action === "remove-own-entry" && activeUser && activeUser.role === "teacher") {
      removeTeacherEntry(target.dataset.date, target.dataset.slot, activeUser.id);
      saveState();
      render();
      return;
    }

    if (action === "reset-day-plan") {
      resetDayPlan(state.adminDate);
      setMessage("ok", "已恢复默认课节");
      saveState();
      render();
      return;
    }

    if (action === "remove-entry") {
      removeEntry(target.dataset.date, target.dataset.slot, target.dataset.entryId);
      setMessage("ok", "已删除一次课时登记");
      saveState();
      render();
      return;
    }

    if (action === "focus-teacher") {
      state.adminFocusTeacherId = target.dataset.teacherId;
      clearMessage();
      saveState();
      render();
      return;
    }

    if (action === "clear-focus-teacher") {
      state.adminFocusTeacherId = null;
      clearMessage();
      saveState();
      render();
      return;
    }

    if (action === "delete-teacher") {
      const teacherId = target.dataset.teacherId;
      const teacher = state.users.find((user) => user.id === teacherId);
      if (!teacher) return;
      const ok = confirm(`确认删除 ${teacher.name} 吗？历史课时会一并清空。`);
      if (!ok) return;

      state.users = state.users.filter((user) => user.id !== teacherId);
      if (state.adminFocusTeacherId === teacherId) state.adminFocusTeacherId = null;
      Object.entries(state.records).forEach(([dateKey, lessons]) => {
        Object.entries(lessons).forEach(([lessonId, entries]) => {
          lessons[lessonId] = entries.filter((entry) => entry.teacherId !== teacherId);
          pruneEmptyRecords(dateKey, lessonId);
        });
      });
      setMessage("ok", "教师已删除");
      saveState();
      render();
    }
  });

  app.addEventListener("change", (event) => {
    const target = event.target;

    if (target.dataset.action === "admin-date") {
      state.adminDate = target.value || formatDate(new Date());
      saveState();
      render();
      return;
    }

    if (target.dataset.action === "toggle-lesson-active") {
      setLessonActive(state.adminDate, target.dataset.slot, target.checked);
      setMessage("ok", "当天课节已更新");
      saveState();
      render();
    }
  });

  render();
})();
