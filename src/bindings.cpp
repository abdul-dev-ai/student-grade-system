#include "grade_engine.hpp"
#include <emscripten/bind.h>

EMSCRIPTEN_BINDINGS(student_grade_engine) {
    emscripten::value_object<grades::Result>("Result")
        .field("ok", &grades::Result::ok)
        .field("message", &grades::Result::message);
    emscripten::class_<grades::GradeEngine>("GradeEngine")
        .constructor<>()
        .function("add", &grades::GradeEngine::add)
        .function("update", &grades::GradeEngine::update)
        .function("remove", &grades::GradeEngine::remove)
        .function("sort", &grades::GradeEngine::sort)
        .function("snapshotJson", &grades::GradeEngine::snapshotJson)
        .function("exportJson", &grades::GradeEngine::exportJson);
}
