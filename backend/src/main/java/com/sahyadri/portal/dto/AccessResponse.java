package com.sahyadri.portal.dto;

import java.util.List;
import java.util.Map;

public record AccessResponse(List<String> roles, List<PermissionDef> permissions, Map<String, Map<String, Boolean>> matrix) {}
