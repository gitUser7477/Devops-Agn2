const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.urlencoded({ extended: true }));

// All DB settings come from environment variables (nothing hardcoded)
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'appuser',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'appdb',
  waitForConnections: true,
  connectionLimit: 10
});

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    roll_no VARCHAR(30) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    title VARCHAR(120) NOT NULL,
    credit_hours INT NOT NULL DEFAULT 3,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS enrollments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    course_id INT NOT NULL,
    grade VARCHAR(2) DEFAULT NULL,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_enrollment (student_id, course_id),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE)`
];

async function initDb() {
  for (const sql of SCHEMA) await pool.query(sql);
  console.log('Database tables ready');
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(title, body, msg) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - Student Manager</title>
<style>
body{font-family:Arial,sans-serif;max-width:900px;margin:20px auto;padding:0 12px;color:#222}
nav a{margin-right:14px;text-decoration:none;color:#0b5ed7;font-weight:bold}
table{border-collapse:collapse;width:100%;margin:12px 0}
th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
th{background:#f0f0f0}
input,select{padding:5px;margin:3px 6px 3px 0}
button{padding:5px 10px;cursor:pointer}
.msg{background:#fff3cd;border:1px solid #ffe69c;padding:8px;margin:10px 0}
.cards div{display:inline-block;border:1px solid #ccc;padding:14px 24px;margin:6px 10px 6px 0;text-align:center}
</style></head><body>
<h1>Student Manager</h1>
<nav><a href="/">Dashboard</a><a href="/students">Students</a><a href="/courses">Courses</a><a href="/enrollments">Enrollments</a></nav>
<hr>${msg ? `<div class="msg">${esc(msg)}</div>` : ''}${body}</body></html>`;
}

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).send(page('Error', `<h2>Something went wrong</h2><p>${esc(err.message)}</p>`));
  });

const dupMsg = (err, text) =>
  err.code === 'ER_DUP_ENTRY' ? text : null;

// ---------- Health check (also verifies DB connectivity) ----------
app.get('/health', wrap(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', database: 'connected' });
}));

// ---------- Dashboard ----------
app.get('/', wrap(async (req, res) => {
  const [[s]] = await pool.query('SELECT COUNT(*) AS n FROM students');
  const [[c]] = await pool.query('SELECT COUNT(*) AS n FROM courses');
  const [[e]] = await pool.query('SELECT COUNT(*) AS n FROM enrollments');
  res.send(page('Dashboard', `<h2>Dashboard</h2>
<div class="cards"><div><h2>${s.n}</h2>Students</div><div><h2>${c.n}</h2>Courses</div><div><h2>${e.n}</h2>Enrollments</div></div>`));
}));

// ---------- Module 1: Students ----------
async function studentsPage(res, msg) {
  const [rows] = await pool.query('SELECT * FROM students ORDER BY id');
  const list = rows.map((r) => `<tr><td>${r.id}</td><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td>${esc(r.roll_no)}</td>
<td><form method="post" action="/students/${r.id}/delete" style="margin:0"><button>Delete</button></form></td></tr>`).join('');
  res.send(page('Students', `<h2>Students</h2>
<form method="post" action="/students">
<input name="name" placeholder="Name" required>
<input name="email" type="email" placeholder="Email" required>
<input name="roll_no" placeholder="Roll No" required>
<button>Add Student</button></form>
<table><tr><th>ID</th><th>Name</th><th>Email</th><th>Roll No</th><th></th></tr>${list || '<tr><td colspan="5">No students yet</td></tr>'}</table>`, msg));
}
app.get('/students', wrap((req, res) => studentsPage(res)));
app.post('/students', wrap(async (req, res) => {
  const { name, email, roll_no } = req.body;
  try {
    await pool.query('INSERT INTO students (name, email, roll_no) VALUES (?, ?, ?)', [name, email, roll_no]);
    res.redirect('/students');
  } catch (err) {
    const m = dupMsg(err, 'A student with that email or roll number already exists.');
    if (m) return studentsPage(res, m);
    throw err;
  }
}));
app.post('/students/:id/delete', wrap(async (req, res) => {
  await pool.query('DELETE FROM students WHERE id = ?', [req.params.id]);
  res.redirect('/students');
}));

// ---------- Module 2: Courses ----------
async function coursesPage(res, msg) {
  const [rows] = await pool.query('SELECT * FROM courses ORDER BY id');
  const list = rows.map((r) => `<tr><td>${r.id}</td><td>${esc(r.code)}</td><td>${esc(r.title)}</td><td>${r.credit_hours}</td>
<td><form method="post" action="/courses/${r.id}/delete" style="margin:0"><button>Delete</button></form></td></tr>`).join('');
  res.send(page('Courses', `<h2>Courses</h2>
<form method="post" action="/courses">
<input name="code" placeholder="Code (e.g. CS101)" required>
<input name="title" placeholder="Title" required>
<input name="credit_hours" type="number" min="1" max="6" value="3" required>
<button>Add Course</button></form>
<table><tr><th>ID</th><th>Code</th><th>Title</th><th>Credit Hours</th><th></th></tr>${list || '<tr><td colspan="5">No courses yet</td></tr>'}</table>`, msg));
}
app.get('/courses', wrap((req, res) => coursesPage(res)));
app.post('/courses', wrap(async (req, res) => {
  const { code, title, credit_hours } = req.body;
  try {
    await pool.query('INSERT INTO courses (code, title, credit_hours) VALUES (?, ?, ?)', [code, title, Number(credit_hours) || 3]);
    res.redirect('/courses');
  } catch (err) {
    const m = dupMsg(err, 'A course with that code already exists.');
    if (m) return coursesPage(res, m);
    throw err;
  }
}));
app.post('/courses/:id/delete', wrap(async (req, res) => {
  await pool.query('DELETE FROM courses WHERE id = ?', [req.params.id]);
  res.redirect('/courses');
}));

// ---------- Module 3: Enrollments ----------
async function enrollmentsPage(res, msg) {
  const [students] = await pool.query('SELECT id, name, roll_no FROM students ORDER BY name');
  const [courses] = await pool.query('SELECT id, code, title FROM courses ORDER BY code');
  const [rows] = await pool.query(`SELECT e.id, e.grade, s.name, s.roll_no, c.code, c.title
    FROM enrollments e JOIN students s ON s.id = e.student_id JOIN courses c ON c.id = e.course_id ORDER BY e.id`);
  const sOpts = students.map((s) => `<option value="${s.id}">${esc(s.name)} (${esc(s.roll_no)})</option>`).join('');
  const cOpts = courses.map((c) => `<option value="${c.id}">${esc(c.code)} - ${esc(c.title)}</option>`).join('');
  const list = rows.map((r) => `<tr><td>${r.id}</td><td>${esc(r.name)} (${esc(r.roll_no)})</td><td>${esc(r.code)} - ${esc(r.title)}</td>
<td><form method="post" action="/enrollments/${r.id}/grade" style="margin:0"><input name="grade" value="${esc(r.grade || '')}" maxlength="2" size="3"><button>Save</button></form></td>
<td><form method="post" action="/enrollments/${r.id}/delete" style="margin:0"><button>Remove</button></form></td></tr>`).join('');
  res.send(page('Enrollments', `<h2>Enrollments</h2>
<form method="post" action="/enrollments">
<select name="student_id" required>${sOpts || '<option value="">Add a student first</option>'}</select>
<select name="course_id" required>${cOpts || '<option value="">Add a course first</option>'}</select>
<button>Enroll</button></form>
<table><tr><th>ID</th><th>Student</th><th>Course</th><th>Grade</th><th></th></tr>${list || '<tr><td colspan="5">No enrollments yet</td></tr>'}</table>`, msg));
}
app.get('/enrollments', wrap((req, res) => enrollmentsPage(res)));
app.post('/enrollments', wrap(async (req, res) => {
  const { student_id, course_id } = req.body;
  try {
    await pool.query('INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)', [student_id, course_id]);
    res.redirect('/enrollments');
  } catch (err) {
    const m = dupMsg(err, 'That student is already enrolled in that course.');
    if (m) return enrollmentsPage(res, m);
    throw err;
  }
}));
app.post('/enrollments/:id/grade', wrap(async (req, res) => {
  await pool.query('UPDATE enrollments SET grade = ? WHERE id = ?', [req.body.grade || null, req.params.id]);
  res.redirect('/enrollments');
}));
app.post('/enrollments/:id/delete', wrap(async (req, res) => {
  await pool.query('DELETE FROM enrollments WHERE id = ?', [req.params.id]);
  res.redirect('/enrollments');
}));

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
initDb().catch((err) => console.error('DB init failed (check DB_* env vars):', err.message));
