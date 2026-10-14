#pragma once

#include <cstddef>
#include <string>

namespace grades {

struct Student {
    std::string id;
    std::string name;
    double score = 0;
};

struct Result {
    bool ok;
    std::string message;
};

struct Statistics {
    std::size_t count = 0;
    double average = 0;
    double highest = 0;
    double lowest = 0;
    double passRate = 0;
    std::size_t passed = 0;
    std::size_t distribution[5]{}; // A, B, C, D, F
};

class GradeEngine {
public:
    static constexpr std::size_t CAPACITY = 1000;
    static constexpr double PASS_MARK = 50;

    Result add(const std::string& id, const std::string& name, double score);
    Result update(const std::string& originalId, const std::string& id,
                  const std::string& name, double score);
    Result remove(const std::string& id);
    Result sort(const std::string& field, bool ascending);
    int findIndex(const std::string& id) const;
    const Student* at(std::size_t index) const;
    std::size_t size() const { return count_; }
    Statistics statistics() const;
    std::string snapshotJson(const std::string& query, const std::string& status) const;
    std::string exportJson() const;
    static char letterGrade(double score);

private:
    // The only student store: a real fixed-size array, with an active prefix.
    Student students_[CAPACITY];
    std::size_t count_ = 0;
    static Result validate(const Student& student);
};

} // namespace grades
