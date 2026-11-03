package com.sahyadri.portal.dto;

import com.sahyadri.portal.repository.User;
import java.util.List;
import java.util.Map;

public record MeResponse(long id, String name, String email, String phone, String flat, String residentType, String role,
                         String status, List<String> permissions, Map<String, Boolean> features) {
    public static MeResponse of(User u, List<String> permissions, Map<String, Boolean> features) {
        return new MeResponse(u.id(), u.name(), u.email(), u.phone(), u.flat(), u.residentType(), u.role(), u.status(), permissions, features);
    }
}
