#ifndef REPORT_REPOSITORY_H
#define REPORT_REPOSITORY_H

#include "../database/Database.h"
#include <string>
#include <vector>

struct PlayerReportRecord {
    long long id = 0;
    long long reporterUserId = 0;
    long long targetUserId = 0;
    long long createdAtMs = 0;
    long long resolvedAtMs = 0;
    long long resolvedByUserId = 0;
    std::string reporterNickname;
    std::string reporterTag;
    std::string targetNickname;
    std::string targetTag;
    std::string targetNicknameSnapshot;
    std::string targetTagSnapshot;
    std::string description;
    std::string reasonCodesJson;
    std::string status;
};

class ReportRepository {
private:
    Database& database;

public:
    explicit ReportRepository(Database& database);

    bool ensureSchema(std::string* error = nullptr);
    bool createReport(
        long long reporterUserId,
        long long targetUserId,
        const std::string& targetNicknameSnapshot,
        const std::string& targetTagSnapshot,
        const std::string& reasonCodesJson,
        const std::string& description,
        PlayerReportRecord* outReport = nullptr,
        std::string* error = nullptr
    );
    std::vector<PlayerReportRecord> listOpenReports(std::string* error = nullptr) const;
    bool resolveReport(
        long long reportId,
        const std::string& status,
        long long resolvedByUserId,
        PlayerReportRecord* outReport = nullptr,
        std::string* error = nullptr
    );
};

#endif
