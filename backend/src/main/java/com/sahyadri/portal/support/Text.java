package com.sahyadri.portal.support;

/** Small string helpers shared by services. */
public final class Text {
    private Text() {}

    /** JS: s.slice(0, max) */
    public static String slice(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }

    public static boolean validEmail(String email) {
        return email.matches("^\\S+@\\S+\\.\\S+$");
    }
}
