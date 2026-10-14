#include "grade_engine.hpp"

#include <cmath>
#include <iomanip>
#include <locale>
#include <sstream>
#include <utility>

namespace grades {
namespace {
bool whitespace(unsigned char c) {
    return c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '\f' || c == '\v';
}
std::string trim(const std::string& value) {
    std::size_t first = 0, last = value.size();
    while (first < last && whitespace(static_cast<unsigned char>(value[first]))) ++first;
    while (last > first && whitespace(static_cast<unsigned char>(value[last - 1]))) --last;
    return value.substr(first, last - first);
}
std::string fold(std::string value) {
    for (char& c : value) if (c >= 'A' && c <= 'Z') c = static_cast<char>(c + ('a' - 'A'));
    return value;
}
std::string normalizeId(std::string value) {
    value = trim(value);
    for (char& c : value) if (c >= 'a' && c <= 'z') c = static_cast<char>(c - ('a' - 'A'));
    return value;
}
std::string quote(const std::string& value) {
    std::ostringstream out;
    out << '"';
    for (unsigned char c : value) {
        switch (c) {
        case '"': out << "\\\""; break;
        case '\\': out << "\\\\"; break;
        case '\b': out << "\\b"; break;
        case '\f': out << "\\f"; break;
        case '\n': out << "\\n"; break;
        case '\r': out << "\\r"; break;
        case '\t': out << "\\t"; break;
        default:
            if (c < 0x20) out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << static_cast<int>(c) << std::dec;
            else out << static_cast<char>(c);
        }
    }
    out << '"';
    return out.str();
}
void writeStudent(std::ostream& out, const Student& s, bool derived) {
    out << "{\"id\":" << quote(s.id) << ",\"name\":" << quote(s.name) << ",\"score\":" << s.score;
    if (derived) out << ",\"grade\":\"" << GradeEngine::letterGrade(s.score)
                     << "\",\"passed\":" << (s.score >= GradeEngine::PASS_MARK ? "true" : "false");
    out << '}';
}
std::ostringstream jsonStream() {
    std::ostringstream out;
    out.imbue(std::locale::classic());
    out << std::setprecision(17);
    return out;
}
} // namespace

Result GradeEngine::validate(const Student& student) {
    if (student.id.empty() || student.id.size() > 24)
        return {false, "Student ID must contain 1 to 24 characters."};
    for (char c : student.id) {
        if (!((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_'))
            return {false, "Student ID may only contain letters, numbers, hyphens and underscores."};
    }
    if (student.name.empty() || student.name.size() > 120)
        return {false, "Name is required and must fit within 120 UTF-8 bytes."};
    for (unsigned char c : student.name)
        if (c < 0x20 || c == 0x7f) return {false, "Name cannot contain control characters."};
    if (!std::isfinite(student.score) || student.score < 0 || student.score > 100)
        return {false, "Score must be a finite number from 0 to 100."};
    return {true, ""};
}

int GradeEngine::findIndex(const std::string& id) const {
    const auto key = normalizeId(id);
    for (std::size_t i = 0; i < count_; ++i)
        if (students_[i].id == key) return static_cast<int>(i);
    return -1;
}

const Student* GradeEngine::at(std::size_t index) const {
    return index < count_ ? &students_[index] : nullptr;
}

Result GradeEngine::add(const std::string& id, const std::string& name, double score) {
    Student candidate{normalizeId(id), trim(name), score};
    const auto validation = validate(candidate);
    if (!validation.ok) return validation;
    if (findIndex(candidate.id) != -1) return {false, "A student with this ID already exists."};
    if (count_ == CAPACITY) return {false, "The class is full. The array holds at most 1,000 students."};
    students_[count_] = std::move(candidate);
    ++count_;
    return {true, "Student added."};
}

Result GradeEngine::update(const std::string& originalId, const std::string& id,
                           const std::string& name, double score) {
    const int index = findIndex(originalId);
    if (index == -1) return {false, "Student was not found."};
    Student candidate{normalizeId(id), trim(name), score};
    const auto validation = validate(candidate);
    if (!validation.ok) return validation;
    const int duplicate = findIndex(candidate.id);
    if (duplicate != -1 && duplicate != index) return {false, "A student with this ID already exists."};
    students_[index] = std::move(candidate);
    return {true, "Student updated."};
}

Result GradeEngine::remove(const std::string& id) {
    const int index = findIndex(id);
    if (index == -1) return {false, "Student was not found."};
    // Close the gap by shifting every following element one position left.
    for (std::size_t i = static_cast<std::size_t>(index); i + 1 < count_; ++i)
        students_[i] = std::move(students_[i + 1]);
    students_[--count_] = Student{};
    return {true, "Student deleted."};
}

Result GradeEngine::sort(const std::string& field, bool ascending) {
    if (field != "name" && field != "score") return {false, "Sort field must be name or score."};
    // Stable insertion sort directly on the active prefix of the fixed array.
    for (std::size_t i = 1; i < count_; ++i) {
        Student key = std::move(students_[i]);
        std::size_t j = i;
        while (j > 0) {
            const Student& prior = students_[j - 1];
            const bool shift = field == "score"
                ? (ascending ? prior.score > key.score : prior.score < key.score)
                : (ascending ? fold(prior.name) > fold(key.name) : fold(prior.name) < fold(key.name));
            if (!shift) break;
            students_[j] = std::move(students_[j - 1]);
            --j;
        }
        students_[j] = std::move(key);
    }
    return {true, "Students sorted."};
}

char GradeEngine::letterGrade(double score) {
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
}

Statistics GradeEngine::statistics() const {
    Statistics stats;
    stats.count = count_;
    if (count_ == 0) return stats;
    stats.lowest = stats.highest = students_[0].score;
    double sum = 0;
    for (std::size_t i = 0; i < count_; ++i) {
        const double score = students_[i].score;
        sum += score;
        if (score < stats.lowest) stats.lowest = score;
        if (score > stats.highest) stats.highest = score;
        if (score >= PASS_MARK) ++stats.passed;
        const char grade = letterGrade(score);
        const std::size_t bucket = grade == 'F' ? 4 : static_cast<std::size_t>(grade - 'A');
        ++stats.distribution[bucket];
    }
    stats.average = sum / static_cast<double>(count_);
    stats.passRate = 100.0 * static_cast<double>(stats.passed) / static_cast<double>(count_);
    return stats;
}

std::string GradeEngine::snapshotJson(const std::string& query, const std::string& status) const {
    auto out = jsonStream();
    const Statistics stats = statistics();
    out << "{\"capacity\":" << CAPACITY << ",\"availableSlots\":" << CAPACITY - count_ << ",\"totalCount\":" << count_
        << ",\"stats\":{\"average\":" << stats.average << ",\"highest\":" << stats.highest
        << ",\"lowest\":" << stats.lowest << ",\"passRate\":" << stats.passRate
        << ",\"passed\":" << stats.passed << ",\"failed\":" << count_ - stats.passed
        << "},\"distribution\":[";
    constexpr char labels[] = {'A', 'B', 'C', 'D', 'F'};
    for (std::size_t i = 0; i < 5; ++i) {
        if (i) out << ',';
        out << "{\"grade\":\"" << labels[i] << "\",\"count\":" << stats.distribution[i]
            << ",\"percentage\":" << (count_ ? 100.0 * static_cast<double>(stats.distribution[i]) / static_cast<double>(count_) : 0) << '}';
    }
    out << "],\"students\":[";
    const std::string needle = fold(trim(query));
    std::size_t matched = 0;
    for (std::size_t i = 0; i < count_; ++i) {
        const Student& s = students_[i];
        const bool matchesText = fold(s.id).find(needle) != std::string::npos || fold(s.name).find(needle) != std::string::npos;
        const bool matchesStatus = status == "all" || (status == "pass" && s.score >= PASS_MARK) || (status == "fail" && s.score < PASS_MARK);
        if (matchesText && matchesStatus) {
            if (matched++) out << ',';
            writeStudent(out, s, true);
        }
    }
    out << "],\"filteredCount\":" << matched << '}';
    return out.str();
}

std::string GradeEngine::exportJson() const {
    auto out = jsonStream();
    out << "{\"version\":1,\"students\":[";
    for (std::size_t i = 0; i < count_; ++i) {
        if (i) out << ',';
        writeStudent(out, students_[i], false);
    }
    out << "]}";
    return out.str();
}
} // namespace grades
