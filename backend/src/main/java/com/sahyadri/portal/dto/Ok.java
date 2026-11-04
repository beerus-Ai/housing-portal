package com.sahyadri.portal.dto;

/** {"ok": true} */
public record Ok(boolean ok) {
    public static final Ok TRUE = new Ok(true);
}
