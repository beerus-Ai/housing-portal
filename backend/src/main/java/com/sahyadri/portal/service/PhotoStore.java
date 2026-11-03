package com.sahyadri.portal.service;

import com.sahyadri.portal.support.ApiException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/**
 * Request photos on disk under portal.upload-dir (default ./uploads). Only JPEG, PNG and WebP up to 5 MB are accepted,
 * and the real file signature must match the declared type. Files are stored as random-uuid + extension.
 */
@Component
public class PhotoStore {
    public static final long MAX_BYTES = 5L * 1024 * 1024;
    private static final Map<String, String> EXT = Map.of("image/jpeg", ".jpg", "image/png", ".png", "image/webp", ".webp");
    private static final Map<String, String> MIME = Map.of(".jpg", "image/jpeg", ".png", "image/png", ".webp", "image/webp");

    private final Path dir;

    public PhotoStore(@Value("${portal.upload-dir:uploads}") String uploadDir) throws IOException {
        this.dir = Path.of(uploadDir).toAbsolutePath().normalize();
        Files.createDirectories(dir);
    }

    private static boolean validSignature(String ext, byte[] b, int n) {
        byte[] h = new byte[12];
        System.arraycopy(b, 0, h, 0, Math.min(n, 12));
        return switch (ext) {
            case ".jpg" -> (h[0] & 0xff) == 0xff && (h[1] & 0xff) == 0xd8 && (h[2] & 0xff) == 0xff;
            case ".png" -> (h[0] & 0xff) == 0x89 && h[1] == 0x50 && h[2] == 0x4e && h[3] == 0x47;
            case ".webp" -> new String(h, 0, 4, StandardCharsets.ISO_8859_1).equals("RIFF")
                    && new String(h, 8, 4, StandardCharsets.ISO_8859_1).equals("WEBP");
            default -> false;
        };
    }

    /** Validates and stores the photo; returns the stored file name. Throws 400 for any problem. */
    public String save(MultipartFile f) {
        String ext = f.getContentType() == null ? null : EXT.get(f.getContentType().toLowerCase());
        if (ext == null) throw new ApiException(400, "Only JPEG, PNG or WebP photos are allowed");
        if (f.getSize() > MAX_BYTES) throw new ApiException(400, "File too large");
        try (InputStream in = f.getInputStream()) {
            byte[] head = in.readNBytes(12);
            if (!validSignature(ext, head, head.length)) throw new ApiException(400, "File is not a valid JPEG, PNG or WebP image");
            String name = UUID.randomUUID() + ext;
            try (InputStream again = f.getInputStream()) {
                Files.copy(again, dir.resolve(name));
            }
            return name;
        } catch (IOException e) {
            throw new IllegalStateException("Could not store upload", e);
        }
    }

    public void delete(String name) {
        if (name == null) return;
        try {
            Files.deleteIfExists(dir.resolve(Path.of(name).getFileName().toString()));
        } catch (IOException ignored) {
            // best effort
        }
    }

    /** The stored file (basename only, so a poisoned DB value can never escape the directory), or null. */
    public Path file(String name) {
        Path p = dir.resolve(Path.of(name).getFileName().toString()).normalize();
        return p.startsWith(dir) && Files.isRegularFile(p) ? p : null;
    }

    public static String mimeOf(String name) {
        int i = name.lastIndexOf('.');
        return i < 0 ? "application/octet-stream" : MIME.getOrDefault(name.substring(i).toLowerCase(), "application/octet-stream");
    }
}
