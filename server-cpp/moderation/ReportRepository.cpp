#include "ReportRepository.h"
#include <optional>

namespace {
long long parseLongLong(const std::optional<std::string>& value) {
    if (!value.has_value() || value->empty()) {
        return 0;
    }

    return std::stoll(*value);
}

std::optional<PlayerReportRecord> mapReport(const DatabaseQueryResult& result) {
    if (!result.ok || result.rows.empty()) {
        return std::nullopt;
    }

    const DatabaseRow& row = result.rows.front();
    PlayerReportRecord report;
    report.id = parseLongLong(row.get("id"));
    report.reporterUserId = parseLongLong(row.get("reporter_user_id"));
    report.targetUserId = parseLongLong(row.get("target_user_id"));
    report.createdAtMs = parseLongLong(row.get("created_at_ms"));
    report.resolvedAtMs = parseLongLong(row.get("resolved_at_ms"));
    report.resolvedByUserId = parseLongLong(row.get("resolved_by_user_id"));
    report.reporterNickname = row.get("reporter_nickname").value_or("");
    report.reporterTag = row.get("reporter_tag").value_or("");
    report.targetNickname = row.get("target_nickname").value_or("");
    report.targetTag = row.get("target_tag").value_or("");
    report.targetNicknameSnapshot = row.get("target_nickname_snapshot").value_or("");
    report.targetTagSnapshot = row.get("target_tag_snapshot").value_or("");
    report.description = row.get("description").value_or("");
    report.reasonCodesJson = row.get("reason_codes").value_or("[]");
    report.status = row.get("status").value_or("open");
    return report;
}

PlayerReportRecord mapReportRow(const DatabaseRow& row) {
    PlayerReportRecord report;
    report.id = parseLongLong(row.get("id"));
    report.reporterUserId = parseLongLong(row.get("reporter_user_id"));
    report.targetUserId = parseLongLong(row.get("target_user_id"));
    report.createdAtMs = parseLongLong(row.get("created_at_ms"));
    report.resolvedAtMs = parseLongLong(row.get("resolved_at_ms"));
    report.resolvedByUserId = parseLongLong(row.get("resolved_by_user_id"));
    report.reporterNickname = row.get("reporter_nickname").value_or("");
    report.reporterTag = row.get("reporter_tag").value_or("");
    report.targetNickname = row.get("target_nickname").value_or("");
    report.targetTag = row.get("target_tag").value_or("");
    report.targetNicknameSnapshot = row.get("target_nickname_snapshot").value_or("");
    report.targetTagSnapshot = row.get("target_tag_snapshot").value_or("");
    report.description = row.get("description").value_or("");
    report.reasonCodesJson = row.get("reason_codes").value_or("[]");
    report.status = row.get("status").value_or("open");
    return report;
}
}

ReportRepository::ReportRepository(Database& database)
    : database(database) {}

bool ReportRepository::ensureSchema(std::string* error) {
    DatabaseQueryResult result = database.execute(
        "CREATE TABLE IF NOT EXISTS player_reports ("
        " id BIGSERIAL PRIMARY KEY,"
        " reporter_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
        " target_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
        " target_nickname_snapshot VARCHAR(20) NOT NULL,"
        " target_tag_snapshot VARCHAR(8) NOT NULL,"
        " reason_codes TEXT NOT NULL,"
        " description TEXT NOT NULL,"
        " status VARCHAR(20) NOT NULL DEFAULT 'open',"
        " created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
        " resolved_at TIMESTAMPTZ NULL,"
        " resolved_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,"
        " CHECK (reporter_user_id <> target_user_id),"
        " CHECK (status IN ('open', 'accepted', 'rejected')),"
        " CHECK (char_length(description) BETWEEN 1 AND 500)"
        ")"
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return false;
    }

    DatabaseQueryResult targetIndex = database.execute(
        "CREATE INDEX IF NOT EXISTS idx_player_reports_target_status_created "
        "ON player_reports(target_user_id, status, created_at DESC)"
    );
    if (!targetIndex.ok) {
        if (error != nullptr) {
            *error = targetIndex.error;
        }
        return false;
    }

    DatabaseQueryResult reporterIndex = database.execute(
        "CREATE INDEX IF NOT EXISTS idx_player_reports_reporter_created "
        "ON player_reports(reporter_user_id, created_at DESC)"
    );
    if (!reporterIndex.ok) {
        if (error != nullptr) {
            *error = reporterIndex.error;
        }
        return false;
    }

    return true;
}

bool ReportRepository::createReport(
    long long reporterUserId,
    long long targetUserId,
    const std::string& targetNicknameSnapshot,
    const std::string& targetTagSnapshot,
    const std::string& reasonCodesJson,
    const std::string& description,
    PlayerReportRecord* outReport,
    std::string* error
) {
    DatabaseQueryResult result = database.execute(
        "INSERT INTO player_reports ("
        " reporter_user_id, target_user_id, target_nickname_snapshot, target_tag_snapshot, reason_codes, description"
        ") VALUES ($1, $2, $3, $4, $5, $6) "
        "RETURNING id, reporter_user_id, target_user_id, target_nickname_snapshot, target_tag_snapshot, "
        " reason_codes, description, status, "
        " CAST(EXTRACT(EPOCH FROM created_at) * 1000 AS BIGINT) AS created_at_ms, "
        " 0::bigint AS resolved_at_ms, "
        " 0::bigint AS resolved_by_user_id, "
        " ''::text AS reporter_nickname, ''::text AS reporter_tag, ''::text AS target_nickname, ''::text AS target_tag",
        {
            std::to_string(reporterUserId),
            std::to_string(targetUserId),
            targetNicknameSnapshot,
            targetTagSnapshot,
            reasonCodesJson,
            description
        }
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return false;
    }

    std::optional<PlayerReportRecord> created = mapReport(result);
    if (!created.has_value()) {
        if (error != nullptr) {
            *error = "Report insert returned no rows";
        }
        return false;
    }

    if (outReport != nullptr) {
        *outReport = *created;
    }

    return true;
}

std::vector<PlayerReportRecord> ReportRepository::listOpenReports(std::string* error) const {
    DatabaseQueryResult result = database.execute(
        "SELECT pr.id, pr.reporter_user_id, pr.target_user_id, pr.target_nickname_snapshot, pr.target_tag_snapshot, "
        " pr.reason_codes, pr.description, pr.status, "
        " CAST(EXTRACT(EPOCH FROM pr.created_at) * 1000 AS BIGINT) AS created_at_ms, "
        " COALESCE(CAST(EXTRACT(EPOCH FROM pr.resolved_at) * 1000 AS BIGINT), 0) AS resolved_at_ms, "
        " COALESCE(pr.resolved_by_user_id, 0) AS resolved_by_user_id, "
        " reporter.nickname AS reporter_nickname, reporter.tag AS reporter_tag, "
        " target.nickname AS target_nickname, target.tag AS target_tag "
        "FROM player_reports pr "
        "JOIN users reporter ON reporter.id = pr.reporter_user_id "
        "JOIN users target ON target.id = pr.target_user_id "
        "WHERE pr.status = 'open' "
        "ORDER BY pr.created_at ASC"
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return {};
    }

    std::vector<PlayerReportRecord> reports;
    reports.reserve(result.rows.size());
    for (const DatabaseRow& row : result.rows) {
        reports.push_back(mapReportRow(row));
    }
    return reports;
}

bool ReportRepository::resolveReport(
    long long reportId,
    const std::string& status,
    long long resolvedByUserId,
    PlayerReportRecord* outReport,
    std::string* error
) {
    DatabaseQueryResult result = database.execute(
        "UPDATE player_reports pr "
        "SET status = $2, resolved_at = NOW(), resolved_by_user_id = $3 "
        "FROM users reporter, users target "
        "WHERE pr.id = $1 "
        "  AND pr.status = 'open' "
        "  AND reporter.id = pr.reporter_user_id "
        "  AND target.id = pr.target_user_id "
        "RETURNING pr.id, pr.reporter_user_id, pr.target_user_id, pr.target_nickname_snapshot, pr.target_tag_snapshot, "
        " pr.reason_codes, pr.description, pr.status, "
        " CAST(EXTRACT(EPOCH FROM pr.created_at) * 1000 AS BIGINT) AS created_at_ms, "
        " COALESCE(CAST(EXTRACT(EPOCH FROM pr.resolved_at) * 1000 AS BIGINT), 0) AS resolved_at_ms, "
        " COALESCE(pr.resolved_by_user_id, 0) AS resolved_by_user_id, "
        " reporter.nickname AS reporter_nickname, reporter.tag AS reporter_tag, "
        " target.nickname AS target_nickname, target.tag AS target_tag",
        {
            std::to_string(reportId),
            status,
            std::to_string(resolvedByUserId)
        }
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return false;
    }

    std::optional<PlayerReportRecord> resolved = mapReport(result);
    if (!resolved.has_value()) {
        if (error != nullptr) {
            *error = "Report resolve affected no rows";
        }
        return false;
    }

    if (outReport != nullptr) {
        *outReport = *resolved;
    }

    return true;
}
