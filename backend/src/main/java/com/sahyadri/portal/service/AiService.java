package com.sahyadri.portal.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sahyadri.portal.support.Text;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Port of ai.js. Everything works with no API key (rules). With ANTHROPIC_API_KEY the model refines the answer,
 * and only redacted free text is ever sent (no names, phones, emails or flat numbers).
 */
@Service
public class AiService {
    public static final List<String> CATEGORIES = List.of("plumbing", "electrical", "lift", "security", "housekeeping", "other");
    public static final List<String> PRIORITIES = List.of("urgent", "high", "normal", "low");

    private static final Map<String, List<String>> KEYWORDS = new LinkedHashMap<>();
    static {
        KEYWORDS.put("plumbing", List.of("tap", "leak", "pipe", "drain", "water", "flush", "toilet", "sink", "geyser", "tank", "seepage", "overflow", "sewage", "bathroom"));
        KEYWORDS.put("electrical", List.of("light", "fan", "switch", "socket", "wire", "spark", "power", "electric", "mcb", "bulb", "short circuit", "inverter", "meter", "tripping"));
        KEYWORDS.put("lift", List.of("lift", "elevator", "stuck in lift", "lift door"));
        KEYWORDS.put("security", List.of("gate", "guard", "theft", "stranger", "suspicious", "intruder", "cctv", "camera", "visitor", "lock", "break-in", "burglar"));
        KEYWORDS.put("housekeeping", List.of("garbage", "trash", "dustbin", "clean", "sweep", "dirty", "smell", "stink", "mosquito", "pest", "cockroach", "garden", "waste", "litter"));
    }
    private static final List<String> URGENT = List.of("fire", "smoke", "spark", "sparking", "short circuit", "electric shock", "shock", "gas leak", "flood", "flooding", "stuck in lift", "trapped", "burst", "sewage overflow", "injury", "unconscious", "theft", "break-in", "burglar", "intruder");
    private static final List<String> HIGH = List.of("no water", "no power", "power cut", "not working", "broken", "overflow", "leaking badly", "blocked", "lift not working", "no electricity", "foul smell", "sewage");
    private static final List<String> LOW = List.of("when possible", "whenever", "no rush", "minor", "small", "paint", "cosmetic", "suggestion");

    private static final Pattern EMAIL = Pattern.compile("[\\w.+-]+@[\\w-]+\\.[\\w.-]+");
    private static final Pattern PHONE = Pattern.compile("(\\+?\\d[\\d\\s-]{7,}\\d)");
    private static final Pattern FLAT_WORD = Pattern.compile("\\b(flat|apt|apartment|unit)\\s*#?\\s*[A-Za-z]?[-\\s]?\\d{1,4}[A-Za-z]?\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern FLAT_CODE = Pattern.compile("\\b[A-Za-z]-?\\d{3,4}\\b");
    private static final Pattern SENTENCE_SPLIT = Pattern.compile("(?<=[.!?])\\s|\\n");
    private static final Pattern JSON_OBJ = Pattern.compile("\\{.*\\}", Pattern.DOTALL);

    private final ObjectMapper mapper;
    private final String apiKey;
    private final String model;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(7)).build();

    public AiService(ObjectMapper mapper, @Value("${ANTHROPIC_API_KEY:}") String apiKey, @Value("${AI_MODEL:}") String model) {
        this.mapper = mapper;
        this.apiKey = apiKey == null ? "" : apiKey;
        this.model = model == null || model.isBlank() ? "claude-haiku-5-5" : model;
    }

    public String mode() {
        return apiKey.isEmpty() ? "rules" : "llm";
    }

    // ---- redaction and rules (pure) ----

    public static String redact(String text) {
        String s = text == null ? "" : text;
        s = EMAIL.matcher(s).replaceAll("[email]");
        s = PHONE.matcher(s).replaceAll("[phone]");
        s = FLAT_WORD.matcher(s).replaceAll("[flat]");
        s = FLAT_CODE.matcher(s).replaceAll("[flat]");
        return Text.slice(s, 1500);
    }

    private static int hits(String text, List<String> words) {
        int n = 0;
        for (String w : words) if (text.contains(w)) n++;
        return n;
    }

    private static Map<String, Object> vendorFor(String category, List<Map<String, Object>> vendors) {
        for (Map<String, Object> v : vendors) {
            if (v.get("trade") != null && v.get("trade").toString().toLowerCase().equals(category)) return v;
        }
        return null;
    }

    /** First sentence (split like the JS regex), capped at max characters. */
    public static String firstSentence(String text, int max) {
        String t = text == null ? "" : text.strip();
        String first = SENTENCE_SPLIT.split(t, -1)[0];
        return Text.slice(first, max);
    }

    /** Result keys: category, priority, summary, vendor_id, confidence, source. */
    public static Map<String, Object> triageRules(String text, List<Map<String, Object>> vendors) {
        String t = text == null ? "" : text.toLowerCase();
        String best = "other";
        int bestN = 0;
        for (var e : KEYWORDS.entrySet()) {
            int n = hits(t, e.getValue());
            if (n > bestN) {
                best = e.getKey();
                bestN = n;
            }
        }
        String priority = hits(t, URGENT) > 0 ? "urgent" : hits(t, HIGH) > 0 ? "high" : hits(t, LOW) > 0 ? "low" : "normal";
        Map<String, Object> vendor = vendorFor(best, vendors);
        double confidence = bestN == 0 ? 0.3 : Math.min(0.95, 0.55 + bestN * 0.15);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("category", best);
        out.put("priority", priority);
        out.put("summary", firstSentence(text, 110));
        out.put("vendor_id", vendor == null ? null : ((Number) vendor.get("id")).longValue());
        out.put("confidence", Math.round(confidence * 100) / 100.0);
        out.put("source", "rules");
        return out;
    }

    private static String cap(String s) {
        return s.isEmpty() ? s : s.substring(0, 1).toUpperCase() + s.substring(1);
    }

    public static Map<String, Object> draftNoticeRules(String rough) {
        String text = (rough == null ? "" : rough).strip().replaceAll("\\s+", " ");
        String sentence = cap(text.replaceFirst("\\.*$", "")) + ".";
        String t = text.toLowerCase();
        String kind = Pattern.compile("water|tank|supply").matcher(t).find() ? "Water supply"
                : Pattern.compile("lift|elevator").matcher(t).find() ? "Lift"
                : Pattern.compile("power|electric|light").matcher(t).find() ? "Power"
                : Pattern.compile("meeting|agm|committee").matcher(t).find() ? "Meeting"
                : Pattern.compile("clean|garbage|pest").matcher(t).find() ? "Housekeeping" : "Society";
        String head = text.split("[.,;]", -1)[0];
        String title = (kind + " notice: " + Text.slice(head, 50)).replaceFirst("\\s+$", "");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("title", Text.slice(title, 80));
        out.put("body", "Dear residents,\n\n" + sentence + "\n\nWe apologise for any inconvenience and thank you for your cooperation.\n\nManaging Committee");
        out.put("source", "rules");
        return out;
    }

    public static String digestRules(Map<String, Object> s) {
        long open = n(s, "open"), unassigned = n(s, "unassigned"), escalated = n(s, "escalated"), urgent = n(s, "urgent");
        long pending = n(s, "pending_users"), wa = n(s, "whatsapp_7d");
        List<String> lines = new java.util.ArrayList<>();
        lines.add("Weekly digest: " + open + " open request" + (open == 1 ? "" : "s") + ".");
        if (unassigned != 0) lines.add(unassigned + (unassigned == 1 ? " still needs" : " still need") + " a vendor.");
        if (escalated != 0) lines.add(escalated + " are past the " + n(s, "sla_hours") + "h target and were escalated.");
        if (urgent != 0) lines.add(urgent + " marked urgent by triage.");
        if (pending != 0) lines.add(pending + " resident" + (pending == 1 ? "" : "s") + " waiting for approval.");
        if (wa != 0) lines.add(wa + " request" + (wa == 1 ? "" : "s") + " came in through WhatsApp this week.");
        if (lines.size() == 1) lines.add("Nothing needs attention.");
        return String.join(" ", lines);
    }

    private static long n(Map<String, Object> s, String k) {
        return s.get(k) instanceof Number x ? x.longValue() : 0;
    }

    // ---- optional model refinement ----

    private String callClaude(String system, String user, int maxTokens) {
        if (apiKey.isEmpty()) return null;
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", model);
            body.put("max_tokens", maxTokens);
            body.put("system", system);
            body.put("messages", List.of(Map.of("role", "user", "content", user)));
            HttpRequest req = HttpRequest.newBuilder(URI.create("https://api.anthropic.com/v1/messages"))
                    .timeout(Duration.ofSeconds(7))
                    .header("content-type", "application/json").header("x-api-key", apiKey).header("anthropic-version", "2023-06-01")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))).build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) return null;
            StringBuilder sb = new StringBuilder();
            for (JsonNode c : mapper.readTree(res.body()).path("content")) sb.append(c.path("text").asText(""));
            String s = sb.toString().strip();
            return s.isEmpty() ? null : s;
        } catch (Exception e) {
            return null;
        }
    }

    private JsonNode parseJson(String s) {
        if (s == null) return null;
        Matcher m = JSON_OBJ.matcher(s);
        if (!m.find()) return null;
        try {
            return mapper.readTree(m.group());
        } catch (Exception e) {
            return null;
        }
    }

    /** Model answer for a request, or null (no key, failure, or an answer outside the allowed values). */
    public Map<String, Object> triageLlm(String text, List<Map<String, Object>> vendors, Map<String, Object> base) {
        String out = callClaude("You triage maintenance requests for a housing society. Reply with JSON only: {\"category\": one of "
                + String.join("|", CATEGORIES) + ", \"priority\": one of " + String.join("|", PRIORITIES)
                + ", \"summary\": max 100 chars}. The text has personal details removed.", redact(text), 200);
        JsonNode j = parseJson(out);
        if (j == null || !CATEGORIES.contains(j.path("category").asText()) || !PRIORITIES.contains(j.path("priority").asText())) return null;
        String cat = j.path("category").asText();
        Map<String, Object> vendor = vendorFor(cat, vendors);
        String summary = j.hasNonNull("summary") && !j.get("summary").asText().isEmpty() ? j.get("summary").asText() : (String) base.get("summary");
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("category", cat);
        r.put("priority", j.path("priority").asText());
        r.put("summary", Text.slice(summary, 110));
        r.put("vendor_id", vendor == null ? null : ((Number) vendor.get("id")).longValue());
        r.put("confidence", 0.9);
        r.put("source", "llm");
        return r;
    }

    // ---- message gate: is this WhatsApp message a request at all? ----

    private static final List<String> REPORT = List.of("not working", "broken", "stopped working", "blocked", "leaking", "leak", "no water", "no power", "power cut", "no electricity", "overflow", "damaged", "stuck", "not clean", "foul smell", "complaint", "please fix", "please repair", "need repair", "needs repair", "out of order", "tripping", "sparking");
    private static final List<String> ASKS = List.of("please", "kindly", "request", "complain", "someone", "need ", "needs ", "urgent", "not been", "since ");
    private static final Pattern NEGATION = Pattern.compile("\\b(not|no|isn't|won't|can't|cannot|doesn't|didn't|never|without)\\b");
    private static final Pattern QUESTION_END = Pattern.compile("\\?\\s*$");
    private static final Pattern QUESTION_START = Pattern.compile("^(who|when|what|where|why|how|is there|is the|are the|does|do you|can we|can i|anyone|any one)\\b");

    private static Map<String, Object> verdict(String kind, String decision, double confidence, String source) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", kind);
        out.put("decision", decision);
        out.put("confidence", confidence);
        out.put("source", source);
        return out;
    }

    /** Result keys: kind, decision (create|review|ignore), confidence, source. */
    public static Map<String, Object> classifyRules(String text) {
        String t = (text == null ? "" : text).toLowerCase().strip();
        int kw = 0;
        for (List<String> words : KEYWORDS.values()) kw += hits(t, words);
        int urgent = hits(t, URGENT);
        int report = hits(t, REPORT) + (NEGATION.matcher(t).find() ? 1 : 0);
        int ask = hits(t, ASKS);
        int signal = kw + urgent + report;
        boolean question = QUESTION_END.matcher(t).find() || QUESTION_START.matcher(t).find();
        if (signal == 0) return t.length() >= 40 && ask > 0 ? verdict("unclear", "review", 0.4, "rules") : verdict("chatter", "ignore", 0.85, "rules");
        if (urgent > 0) return verdict("request", "create", 0.9, "rules");
        if (question) return verdict("question", "review", 0.5, "rules");
        if (report == 0 && !(ask > 0 && kw > 0)) return verdict("unclear", "review", 0.4, "rules");
        return verdict("request", "create", Math.min(0.95, 0.6 + (kw + report) * 0.1), "rules");
    }

    /** Model verdict, or null (no key, failure, or an answer outside the allowed kinds). */
    public Map<String, Object> classifyLlm(String text) {
        String out = callClaude("You read one message from a residents WhatsApp group of a housing society. Decide if it reports a fault or asks the society for a service (request), asks a general question (question), or is chat, greetings, announcements, opinions or thanks (chatter). Reply with JSON only: {\"kind\": \"request\"|\"question\"|\"chatter\", \"confidence\": 0 to 1}. The text has personal details removed.", redact(text), 60);
        JsonNode j = parseJson(out);
        if (j == null) return null;
        String kind = j.path("kind").asText("");
        if (!List.of("request", "question", "chatter").contains(kind)) return null;
        double c = Math.max(0, Math.min(1, j.path("confidence").asDouble(0)));
        String decision = c < 0.7 ? "review" : "request".equals(kind) ? "create" : "ignore";
        return verdict(kind, decision, Math.round(c * 100) / 100.0, "llm");
    }

    public Map<String, Object> classifyMessage(String text) {
        if (apiKey.isEmpty()) return classifyRules(text);
        Map<String, Object> v = classifyLlm(text);
        return v != null ? v : classifyRules(text);
    }

    public Map<String, Object> draftNotice(String rough) {
        Map<String, Object> base = draftNoticeRules(rough);
        String out = callClaude("You write short, polite notices for a housing society notice board. Reply with JSON only: {\"title\": max 80 chars, \"body\": plain text, under 120 words, starts with \"Dear residents,\", ends with \"Managing Committee\"}. Do not invent dates, names or numbers that are not in the input.", redact(rough), 400);
        JsonNode j = parseJson(out);
        if (j != null && j.hasNonNull("title") && j.hasNonNull("body") && !j.get("title").asText().isEmpty() && !j.get("body").asText().isEmpty()) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("title", Text.slice(j.get("title").asText(), 80));
            r.put("body", Text.slice(j.get("body").asText(), 1500));
            r.put("source", "llm");
            return r;
        }
        return base;
    }

    public Map<String, Object> digest(Map<String, Object> stats) {
        String base = digestRules(stats);
        String out = callClaude("Rewrite this housing society status in 2-3 friendly sentences for the committee. Keep every number exactly as given and add nothing.", base, 200);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("text", out != null ? out : base);
        r.put("source", out != null ? "llm" : "rules");
        return r;
    }
}
