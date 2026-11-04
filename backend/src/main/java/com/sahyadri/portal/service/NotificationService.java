package com.sahyadri.portal.service;

import com.sahyadri.portal.repository.NotificationRepository;
import com.sahyadri.portal.repository.UserRepository;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class NotificationService {
    private final NotificationRepository repo;
    private final UserRepository users;

    public NotificationService(NotificationRepository repo, UserRepository users) {
        this.repo = repo;
        this.users = users;
    }

    public void notify(long userId, String message) {
        repo.insert(userId, message);
    }

    public void notifyAdmins(String message) {
        for (long id : users.adminIds()) repo.insert(id, message);
    }

    public long unreadCount(long userId) {
        return repo.unread(userId);
    }

    public List<Map<String, Object>> latest(long userId) {
        return repo.latest(userId);
    }

    public void markAllRead(long userId) {
        repo.markAllRead(userId);
    }
}
