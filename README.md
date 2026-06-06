# 🎓 Student Management System (SMS)

A modern, full-featured Student Management System built with Express.js, Pug, MySQL, and Sequelize.

## Features

- **Dashboard** — stats cards (Total, Boys, Girls, Completed, Transferred) + bar chart by class
- **Students** — full CRUD, search/filter, move individual student or entire class
- **Departments** — manage academic departments
- **Classes** — manage classes with levels for promotion ordering
- **Streams** — manage streams per class
- **Users** — role-based access (Admin, Teacher, Viewer)
- **Status management** — Ongoing / Completed / Transferred

## Prerequisites

- Node.js 18+
- MySQL 8.0+

## Setup

### 1. Create MySQL Database

```sql
CREATE DATABASE student_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Configure Environment

Edit `.env`:
```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=student_management
DB_USER=root
DB_PASS=your_password
SESSION_SECRET=change_this_in_production
PORT=3000
```

### 3. Install & Run

```bash
npm install
npm start
```

The app auto-creates all tables and a default admin account.

## Default Login

| Field    | Value     |
|----------|-----------|
| Username | `admin`   |
| Password | `admin123`|

⚠️ **Change the default password immediately after first login!**

## User Roles

| Role    | Permissions                              |
|---------|------------------------------------------|
| Admin   | Full access: CRUD + user management      |
| Teacher | Add/edit students, view all              |
| Viewer  | Read-only access to all modules          |

## Data Modules

| Module     | Fields                                                                      |
|------------|-----------------------------------------------------------------------------|
| Department | DeptID, DeptName, Description                                               |
| Class      | ClassID, ClassName, DeptID, Level                                           |
| Stream     | StmID, StmName, ClassID                                                     |
| Student    | StudentID, StudentFullName, ParentPhone, ParentEmail, ClassID, StmID, Gender, Status, AdmissionNumber, DateOfBirth, AdmissionDate, Address |

## Student Statuses

- **Ongoing** — currently enrolled
- **Completed** — finished school
- **Transferred** — moved to another school

## Scalability

- Connection pooling (max 20 connections)
- Database indexes on ClassID, StmID, Status, Gender
- Pagination (20 per page)
- Handles 1000+ students comfortably

## Production Checklist

- [ ] Change `SESSION_SECRET` in `.env`
- [ ] Change default admin password
- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS (reverse proxy: nginx)
- [ ] Regular database backups
