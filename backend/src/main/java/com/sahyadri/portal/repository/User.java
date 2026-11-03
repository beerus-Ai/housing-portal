package com.sahyadri.portal.repository;

/** A row of the users table. Doubles as the authenticated principal. */
public record User(long id, String name, String email, String phone, String flat, String residentType,
                   String passwordHash, String role, String status) {
    public boolean isAdmin() {
        return "admin".equals(role);
    }
}
