/**
 * SMS — User Role Management
 * ──────────────────────────
 * Add to app.js:
 *   app.use('/users', isAuthenticated, require('./routes/user-roles'));
 *   (mount BEFORE the existing /users route)
 */

const express = require("express");
const router = express.Router();
const { User } = require("../models");
const { isAdmin } = require("../middleware/auth");
const { Op } = require("sequelize");

// ── Permission matrix ──────────────────────────────────────────────
// Defines which role capabilities each system role grants.
// Admin permissions cannot be changed from this UI — only Teacher / Viewer.
const ROLE_PERMISSIONS = {
  admin: {
    label: "Admin",
    color: "violet",
    description: "Full system access — manage everything",
    capabilities: [
      "View all modules",
      "Add / edit / delete students",
      "Promote classes",
      "Manage departments, classes, streams",
      "Manage users & roles",
      "Database backup",
      "School settings",
    ],
    editable: false, // cannot be assigned/revoked from this UI
  },
  teacher: {
    label: "Teacher",
    color: "emerald",
    description: "Can add/edit students, view all data",
    capabilities: [
      "View all modules",
      "Add new students",
      "Edit student details",
      "Move / promote students",
      "Print student profiles",
      "Import students via CSV",
    ],
    editable: true,
  },
  viewer: {
    label: "Viewer",
    color: "blue",
    description: "Read-only access to all data",
    capabilities: [
      "View all modules",
      "View student profiles",
      "View departments & classes",
      "Print student lists",
      "View school information",
    ],
    editable: true,
  },
};

// ── GET /users/roles — roles management page ──
router.get("/roles", isAdmin, async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ["Password"] },
      order: [["FullName", "ASC"]],
    });

    // Group users by role for the overview
    const byRole = {
      admin: users.filter((u) => u.Role === "admin"),
      teacher: users.filter((u) => u.Role === "teacher"),
      viewer: users.filter((u) => u.Role === "viewer"),
    };

    res.render("admin/users/roles", {
      title: "Role Management — SMS",
      users,
      byRole,
      ROLE_PERMISSIONS,
      currentUserId: req.session.userId,
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to load roles page");
    res.redirect("/users");
  }
});

// ── POST /users/roles/assign — assign or revoke a role ──
// Accepts both AJAX (returns JSON) and regular form POST (redirects)
router.post("/roles/assign", isAdmin, async (req, res) => {
  const isAjax =
    req.headers["x-requested-with"] === "XMLHttpRequest" ||
    req.headers["accept"]?.includes("application/json");

  try {
    const { userId, role } = req.body;

    // Validate role
    if (!["admin", "teacher", "viewer"].includes(role)) {
      const msg = "Invalid role specified";
      return isAjax
        ? res.status(400).json({ success: false, message: msg })
        : (req.flash("error", msg), res.redirect("/users/roles"));
    }

    // Cannot demote yourself
    if (parseInt(userId) === parseInt(req.session.userId)) {
      const msg = "You cannot change your own role";
      return isAjax
        ? res.status(403).json({ success: false, message: msg })
        : (req.flash("error", msg), res.redirect("/users/roles"));
    }

    const user = await User.findByPk(userId, {
      attributes: { exclude: ["Password"] },
    });
    if (!user) {
      const msg = "User not found";
      return isAjax
        ? res.status(404).json({ success: false, message: msg })
        : (req.flash("error", msg), res.redirect("/users/roles"));
    }

    const prevRole = user.Role;
    await user.update({ Role: role });

    const msg = `${user.FullName}'s role changed from ${prevRole} to ${role}`;
    return isAjax
      ? res.json({
          success: true,
          message: msg,
          userId: user.UserID,
          newRole: role,
          prevRole,
          fullName: user.FullName,
        })
      : (req.flash("success", msg), res.redirect("/users/roles"));
  } catch (err) {
    console.error(err);
    const msg = "Failed to update role: " + err.message;
    return isAjax
      ? res.status(500).json({ success: false, message: msg })
      : (req.flash("error", msg), res.redirect("/users/roles"));
  }
});

// ── POST /users/roles/bulk — assign role to multiple users ──
router.post("/roles/bulk", isAdmin, async (req, res) => {
  const isAjax =
    req.headers["x-requested-with"] === "XMLHttpRequest" ||
    req.headers["accept"]?.includes("application/json");
  try {
    let { userIds, role } = req.body;

    if (!["teacher", "viewer"].includes(role)) {
      const msg = "Bulk assignment only supports Teacher and Viewer roles";
      return isAjax
        ? res.status(400).json({ success: false, message: msg })
        : (req.flash("error", msg), res.redirect("/users/roles"));
    }

    if (!userIds) userIds = [];
    if (!Array.isArray(userIds)) userIds = [userIds];
    userIds = userIds
      .map((id) => parseInt(id))
      .filter((id) => !isNaN(id) && id !== parseInt(req.session.userId));

    if (userIds.length === 0) {
      const msg = "No valid users selected";
      return isAjax
        ? res.status(400).json({ success: false, message: msg })
        : (req.flash("error", msg), res.redirect("/users/roles"));
    }

    const [count] = await User.update(
      { Role: role },
      { where: { UserID: { [Op.in]: userIds } } },
    );

    const msg = `${count} user(s) updated to role: ${role}`;
    return isAjax
      ? res.json({ success: true, message: msg, count, role })
      : (req.flash("success", msg), res.redirect("/users/roles"));
  } catch (err) {
    console.error(err);
    const msg = "Bulk update failed: " + err.message;
    return isAjax
      ? res.status(500).json({ success: false, message: msg })
      : (req.flash("error", msg), res.redirect("/users/roles"));
  }
});

module.exports = router;
