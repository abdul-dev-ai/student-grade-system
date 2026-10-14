#include "grade_engine.hpp"
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <string>

namespace {
int checks = 0;
void check(bool condition, const char* expression, int line) {
    ++checks;
    if (!condition) {
        std::cerr << "FAIL at line " << line << ": " << expression << '\n';
        std::exit(1);
    }
}
#define CHECK(expression) check((expression), #expression, __LINE__)
bool near(double actual, double expected) { return std::fabs(actual - expected) < 1e-9; }

void emptyAndValidation() {
    grades::GradeEngine engine;
    CHECK(engine.size() == 0);
    CHECK(engine.at(0) == nullptr);
    CHECK(engine.at(1000) == nullptr);
    CHECK(engine.findIndex("missing") == -1);
    CHECK(!engine.remove("missing").ok);
    CHECK(!engine.update("missing", "1", "Name", 50).ok);
    CHECK(engine.sort("name", true).ok);
    CHECK(!engine.sort("unknown", true).ok);
    CHECK(engine.exportJson() == "{\"version\":1,\"students\":[]}");
    auto stats = engine.statistics();
    CHECK(stats.count == 0 && stats.passed == 0);
    CHECK(stats.average == 0 && stats.lowest == 0 && stats.highest == 0 && stats.passRate == 0);
    for (const auto bucket : stats.distribution) CHECK(bucket == 0);
    CHECK(!engine.add("", "Name", 50).ok);
    CHECK(!engine.add("A B", "Name", 50).ok);
    CHECK(!engine.add("A/B", "Name", 50).ok);
    CHECK(!engine.add(std::string(25, 'A'), "Name", 50).ok);
    CHECK(!engine.add("A", "   \t", 50).ok);
    CHECK(!engine.add("A", std::string(121, 'n'), 50).ok);
    CHECK(!engine.add("A", "Two\nLines", 50).ok);
    CHECK(!engine.add("A", "Name", -0.01).ok);
    CHECK(!engine.add("A", "Name", 100.01).ok);
    CHECK(!engine.add("A", "Name", std::numeric_limits<double>::infinity()).ok);
    CHECK(!engine.add("A", "Name", -std::numeric_limits<double>::infinity()).ok);
    CHECK(!engine.add("A", "Name", std::numeric_limits<double>::quiet_NaN()).ok);
    CHECK(engine.size() == 0);
    CHECK(engine.add(" st-1 ", "  Ama Mensah  ", 0).ok);
    CHECK(engine.at(0)->id == "ST-1" && engine.at(0)->name == "Ama Mensah");
    CHECK(engine.findIndex("st-1") == 0);
    CHECK(!engine.add("St-1", "Other", 100).ok);
    CHECK(engine.add("B_2", "Other", 100).ok);
    CHECK(engine.add(std::string(24, 'A'), std::string(120, 'n'), 42.125).ok);
    CHECK(engine.size() == 3);
}

void updatesAndDeletion() {
    grades::GradeEngine engine;
    CHECK(engine.add("A", "Alpha", 60).ok);
    CHECK(engine.add("B", "Beta", 70).ok);
    CHECK(engine.add("C", "Gamma", 80).ok);
    CHECK(engine.add("D", "Delta", 90).ok);
    const std::string before = engine.exportJson();
    CHECK(!engine.update("B", "A", "Clash", 44).ok);
    CHECK(!engine.update("B", "B", "", 44).ok);
    CHECK(!engine.update("B", "B", "Beta", 101).ok);
    CHECK(engine.exportJson() == before);
    CHECK(engine.update("b", "b-2", "  New name ", 49.5).ok);
    CHECK(engine.findIndex("B") == -1 && engine.findIndex("B-2") == 1);
    CHECK(engine.at(1)->name == "New name" && near(engine.at(1)->score, 49.5));
    CHECK(engine.update("B-2", "b-2", "New name", 50).ok);
    CHECK(engine.remove("b-2").ok);
    CHECK(engine.size() == 3);
    CHECK(engine.at(0)->id == "A" && engine.at(1)->id == "C" && engine.at(2)->id == "D");
    CHECK(engine.at(3) == nullptr);
    CHECK(engine.remove("A").ok);
    CHECK(engine.at(0)->id == "C" && engine.at(1)->id == "D");
    CHECK(engine.remove("D").ok);
    CHECK(engine.remove("C").ok);
    CHECK(engine.size() == 0);
    CHECK(!engine.remove("C").ok);
    CHECK(engine.add("E", "Reused slot", 88).ok);
    CHECK(engine.size() == 1 && engine.at(0)->id == "E");
}

void gradesAndStats() {
    grades::GradeEngine engine;
    const double scores[] = {0, 49.999, 50, 59.999, 60, 69.999, 70, 79.999, 80, 100};
    const char letters[] = {'F', 'F', 'D', 'D', 'C', 'C', 'B', 'B', 'A', 'A'};
    for (std::size_t i = 0; i < 10; ++i) {
        CHECK(grades::GradeEngine::letterGrade(scores[i]) == letters[i]);
        CHECK(engine.add(std::to_string(i), "Student " + std::to_string(i), scores[i]).ok);
    }
    const auto stats = engine.statistics();
    CHECK(stats.count == 10 && stats.passed == 8);
    CHECK(near(stats.average, 61.9996));
    CHECK(near(stats.passRate, 80));
    CHECK(stats.lowest == 0 && stats.highest == 100);
    for (const auto bucket : stats.distribution) CHECK(bucket == 2);
    CHECK(engine.remove("9").ok);
    CHECK(engine.statistics().highest == 80);
    CHECK(engine.remove("0").ok);
    CHECK(near(engine.statistics().lowest, 49.999));
    grades::GradeEngine single;
    CHECK(single.add("A", "Single", 73.125).ok);
    CHECK(single.statistics().average == 73.125);
    CHECK(single.statistics().lowest == single.statistics().highest);
    CHECK(single.statistics().passRate == 100);
}

void sortingAndSearch() {
    grades::GradeEngine engine;
    CHECK(engine.add("A", "Zoe", 80).ok);
    CHECK(engine.add("B", "ama", 40).ok);
    CHECK(engine.add("C", "Bob", 80).ok);
    CHECK(engine.add("D", "AMA", 60).ok);
    CHECK(engine.sort("score", true).ok);
    CHECK(engine.at(0)->id == "B" && engine.at(1)->id == "D" && engine.at(2)->id == "A" && engine.at(3)->id == "C");
    CHECK(engine.sort("score", false).ok);
    CHECK(engine.at(0)->id == "A" && engine.at(1)->id == "C");
    CHECK(engine.sort("name", true).ok);
    CHECK(engine.at(0)->id == "D" && engine.at(1)->id == "B" && engine.at(2)->id == "C" && engine.at(3)->id == "A");
    CHECK(engine.sort("name", false).ok);
    CHECK(engine.at(0)->id == "A" && engine.at(1)->id == "C" && engine.at(2)->id == "D" && engine.at(3)->id == "B");
    CHECK(engine.snapshotJson("  aMa ", "all").find("\"filteredCount\":2") != std::string::npos);
    CHECK(engine.snapshotJson("ama", "pass").find("\"filteredCount\":1") != std::string::npos);
    CHECK(engine.snapshotJson("", "fail").find("\"filteredCount\":1") != std::string::npos);
    CHECK(engine.snapshotJson("unknown", "all").find("\"filteredCount\":0") != std::string::npos);
    CHECK(engine.snapshotJson("c", "all").find("\"id\":\"C\"") != std::string::npos);
    CHECK(engine.snapshotJson("", "invalid").find("\"filteredCount\":0") != std::string::npos);
    CHECK(engine.statistics().count == 4);
}

void capacityAndSerialization() {
    grades::GradeEngine engine;
    for (std::size_t i = 0; i < grades::GradeEngine::CAPACITY; ++i)
        CHECK(engine.add("S" + std::to_string(i), "Student " + std::to_string(i), static_cast<double>(i % 101)).ok);
    CHECK(engine.size() == 1000);
    const auto full = engine.exportJson();
    CHECK(!engine.add("OVER", "Overflow", 50).ok);
    CHECK(engine.exportJson() == full);
    CHECK(engine.update("S999", "S999", "Still editable", 25).ok);
    CHECK(engine.remove("S500").ok);
    CHECK(engine.at(500)->id == "S501");
    CHECK(engine.at(998)->id == "S999");
    CHECK(engine.add("REUSED", "New student", 100).ok);
    CHECK(engine.size() == 1000 && engine.at(999)->id == "REUSED");
    CHECK(engine.sort("score", false).ok);
    for (std::size_t i = 1; i < engine.size(); ++i) CHECK(engine.at(i - 1)->score >= engine.at(i)->score);
    grades::GradeEngine escaped;
    CHECK(escaped.add("Q", "Name \"quoted\" \\ <script>", 12.3456789).ok);
    CHECK(escaped.add("U", u8"Ési 李", 50).ok);
    CHECK(escaped.exportJson().find("Name \\\"quoted\\\" \\\\ <script>") != std::string::npos);
    CHECK(escaped.exportJson().find(u8"Ési 李") != std::string::npos);
    CHECK(escaped.snapshotJson("", "all").find("\"passed\":false") != std::string::npos);
}
} // namespace

int main(int argc, char** argv) {
    if (argc == 2 && std::string(argv[1]) == "--json-fixture") {
        grades::GradeEngine engine;
        engine.add("Q", u8"Ési \"quoted\" \\ 李 <script>", 49.999);
        engine.add("A", "Ama", 100);
        std::cout << engine.snapshotJson("", "all") << '\n' << engine.exportJson() << '\n';
        return 0;
    }
    emptyAndValidation();
    updatesAndDeletion();
    gradesAndStats();
    sortingAndSearch();
    capacityAndSerialization();
    std::cout << "PASS: " << checks << " checks across 5 native test suites.\n";
    return 0;
}
