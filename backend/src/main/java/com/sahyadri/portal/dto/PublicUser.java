package com.sahyadri.portal.dto;

import com.sahyadri.portal.repository.User;

/** The user fields the API exposes (never the password hash). JSON keys are snake_case. */
public record PublicUser(long id, String name, String email, String phone, String flat, String residentType, String role, String status) {
    public static PublicUser from(User u) {
        return new PublicUser(u.id(), u.name(), u.email(), u.phone(), u.flat(), u.residentType(), u.role(), u.status());
    }
}
