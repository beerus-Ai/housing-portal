# syntax=docker/dockerfile:1
# Stage 1: build the Spring Boot jar with Gradle on JDK 17.
FROM eclipse-temurin:17-jdk AS build
WORKDIR /src
COPY gradlew settings.gradle build.gradle ./
COPY gradle ./gradle
RUN chmod +x gradlew && ./gradlew --no-daemon --version
COPY src ./src
# Tests run in CI; the image build only packages.
RUN ./gradlew --no-daemon bootJar -x test \
 && cp "$(ls build/libs/*.jar | grep -v -- '-plain' | head -n 1)" /app.jar

# Stage 2: slim JRE runtime, non-root.
FROM eclipse-temurin:17-jre-alpine
RUN addgroup -S portal && adduser -S -G portal -h /app portal
WORKDIR /app
COPY --from=build /app.jar /app/app.jar
USER portal
ENV SPRING_PROFILES_ACTIVE=prod \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError" \
    DB_HOST=postgres DB_PORT=5432 DB_NAME=portal DB_USER=portal
# Supplied at run time, never baked in: DB_PASSWORD, SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD (12+ chars on first start).
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
