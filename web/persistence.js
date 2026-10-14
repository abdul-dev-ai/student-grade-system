export const STORAGE_KEY = 'gradebook.students.v1';

// JSON is a transport format only. Every record goes through C++ validation.
// Build a temporary engine, so invalid snapshots can never partially restore.
export function restoreEngine(Module, raw) {
  const data = JSON.parse(raw);
  if (!data || data.version !== 1 || !Array.isArray(data.students)) {
    throw new Error('Unsupported snapshot format.');
  }
  if (data.students.length > 1000) throw new Error('Snapshot exceeds the 1,000-student capacity.');
  const candidate = new Module.GradeEngine();
  try {
    for (const student of data.students) {
      if (!student || typeof student.id !== 'string' || typeof student.name !== 'string' || typeof student.score !== 'number') {
        throw new Error('A record has invalid field types.');
      }
      const result = candidate.add(student.id, student.name, student.score);
      if (!result.ok) throw new Error(result.message);
    }
    return candidate;
  } catch (error) {
    candidate.delete();
    throw error;
  }
}
