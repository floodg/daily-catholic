import { useEffect, useMemo, useState } from "react";
import type { Workout, PlannedWorkout, WorkoutProgressEntry } from "../../domain/types";
import {
  getWorkouts,
  addWorkout,
  updateWorkout,
  deleteWorkout,
  getPlannedWorkouts,
  addPlannedWorkout,
  deletePlannedWorkout,
  updatePlannedWorkoutStatus,
  saveWorkoutProgress,
  seedWorkoutRotationIfEmpty,
} from "../../storage/dataService";
import { v4 as uuidv4 } from "../../storage/uuid";
import { formatDateLocal, getMondayLocal } from "../../lib/dateUtils";
import { ChevronLeft, ChevronRight, Plus, Check } from "lucide-react";

export default function WorkoutsPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showQuickScheduleModal, setShowQuickScheduleModal] = useState(false);
  const [quickScheduleDate, setQuickScheduleDate] = useState<string>("");
  const [showLogModal, setShowLogModal] = useState(false);
  const [logPlannedId, setLogPlannedId] = useState<string | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getMondayLocal(new Date()));
  const todayStr = formatDateLocal(new Date());

  useEffect(() => {
    // Ensure initial rotation exists if user has no planned workouts
    seedWorkoutRotationIfEmpty();
    loadData();
  }, []);

  const loadData = () => {
    const list = getWorkouts();
    const planned = getPlannedWorkouts();
    setWorkouts(list);
    setPlannedWorkouts(planned);
    const currentId = selectedWorkout?.id;
    if (currentId && !isEditing) {
      const next = list.find((w) => w.id === currentId);
      if (next) setSelectedWorkout(next);
    }
  };

  // ── Weekly calendar helpers ────────────────────────────────────────────────────
  function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  const weekDates: Date[] = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i)),
    [currentWeekStart]
  );

  const getPlannedForDate = (date: Date): PlannedWorkout | undefined => {
    const dateStr = formatDateLocal(date);
    return plannedWorkouts.find(pw => pw.date === dateStr);
  };

  const getWorkoutName = (id: string): string => {
    return workouts.find(w => w.id === id)?.name ?? "Unknown workout";
  };

  const handleAddNew = () => {
    const newWorkout: Workout = {
      id: uuidv4(),
      name: "",
      exercises: [],
    };
    setSelectedWorkout(newWorkout);
    setIsEditing(true);
  };

  const handleEdit = (workout: Workout) => {
    setSelectedWorkout({ ...workout });
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!selectedWorkout || !selectedWorkout.name.trim()) {
      alert("Please enter a workout name");
      return;
    }

    const existingWorkout = workouts.find(w => w.id === selectedWorkout.id);
    if (existingWorkout) {
      updateWorkout(selectedWorkout);
    } else {
      addWorkout(selectedWorkout);
    }

    loadData();
    setIsEditing(false);
    setSelectedWorkout(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSelectedWorkout(null);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this workout?")) {
      deleteWorkout(id);
      loadData();
      if (selectedWorkout?.id === id) {
        setSelectedWorkout(null);
        setIsEditing(false);
      }
    }
  };

  const handleViewDetails = (workout: Workout) => {
    setSelectedWorkout(workout);
    setIsEditing(false);
  };

  const handleSchedule = (workout: Workout) => {
    setSelectedWorkout(workout);
    setShowScheduleModal(true);
  };

  const handleSaveSchedule = (date: string, time: string) => {
    if (!selectedWorkout) return;
    
    const plannedWorkout: PlannedWorkout = {
      id: uuidv4(),
      date,
      workoutId: selectedWorkout.id,
      time: time || undefined,
      status: "planned",
    };
    addPlannedWorkout(plannedWorkout);
    loadData();
    setShowScheduleModal(false);
  };

  const handleDeleteScheduled = (id: string) => {
    if (confirm("Remove this workout from schedule?")) {
      deletePlannedWorkout(id);
      loadData();
    }
  };

  const getScheduledWorkouts = () => {
    return plannedWorkouts.map(pw => {
      const workout = workouts.find(w => w.id === pw.workoutId);
      return { ...pw, workout };
    }).sort((a, b) => a.date.localeCompare(b.date));
  };

  // ── Calendar actions ───────────────────────────────────────────────────────────
  const handleAddOnDate = (date: Date) => {
    setQuickScheduleDate(formatDateLocal(date));
    setShowQuickScheduleModal(true);
  };

  const handleStatusChange = (pw: PlannedWorkout, status: "completed" | "skipped" | "planned") => {
    updatePlannedWorkoutStatus(pw.id, status);
    loadData();
  };

  const openLogFor = (pw: PlannedWorkout) => {
    setLogPlannedId(pw.id);
    setShowLogModal(true);
  };

  const currentWeekLabel = `${weekDates[0].toLocaleDateString("en-AU", { day: "numeric", month: "short" })} → ${weekDates[6].toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`;

  return (
    <div className="workouts-page">
      <div className="page-header-bar">
        <h1 className="page-title">💪 Workouts</h1>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button className="btn-app-secondary" onClick={handleAddNew}>+ Add New Workout</button>
        </div>
      </div>

      {/* Weekly calendar */}
      <div className="app-card" style={{ marginBottom: "1.25rem", padding: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <div>
            <p className="page-eyebrow">Weekly Training</p>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {currentWeekLabel}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn-app-ghost" onClick={() => setCurrentWeekStart(d => addDays(d, -7))} title="Previous week">
              <ChevronLeft size={18} />
            </button>
            <button className="btn-app-secondary" onClick={() => setCurrentWeekStart(getMondayLocal(new Date()))} style={{ fontSize: "0.8rem", padding: "0.375rem 0.875rem" }}>
              Today
            </button>
            <button className="btn-app-ghost" onClick={() => setCurrentWeekStart(d => addDays(d, 7))} title="Next week">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div style={{ overflowX: "auto", borderRadius: 16, boxShadow: "var(--card-shadow)" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: `120px repeat(7, minmax(130px, 1fr))`,
            background: "var(--app-surface)",
            border: "1px solid var(--app-border)",
            borderRadius: 16,
            overflow: "hidden",
            minWidth: 760,
          }}>
            {/* Corner label */}
            <div style={{
              background: "#0d1117",
              padding: "0.875rem 0.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <span style={{
                fontSize: "0.6rem",
                color: "rgba(255,255,255,0.3)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontFamily: "DM Sans, sans-serif",
              }}>
                Session
              </span>
            </div>

            {/* Day headers */}
            {weekDates.map((date, i) => {
              const ds = formatDateLocal(date);
              const isToday = ds === todayStr;
              const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
              return (
                <div key={i} style={{
                  background: isToday ? "rgba(201,168,76,0.12)" : "#0d1117",
                  padding: "0.625rem 0.5rem",
                  textAlign: "center",
                  borderLeft: "1px solid rgba(255,255,255,0.07)",
                }}>
                  <div style={{
                    fontFamily: "DM Sans, sans-serif",
                    fontWeight: 700,
                    fontSize: "0.65rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: isToday ? "#c9a84c" : "rgba(232,224,208,0.45)",
                    marginBottom: "0.125rem",
                  }}>
                    {DAYS[i]}
                  </div>
                  <div style={{
                    fontSize: "0.75rem",
                    color: isToday ? "#c9a84c" : "rgba(232,224,208,0.8)",
                    fontFamily: "DM Sans, sans-serif",
                    fontWeight: 500,
                  }}>
                    {date.getDate()}/{date.getMonth() + 1}
                  </div>
                </div>
              );
            })}

            {/* Single row for workout session */}
            <>
              {/* Row label */}
              <div style={{
                padding: "0.75rem 0.5rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                borderTop: "1px solid var(--app-border)",
                background: "var(--app-bg)",
                gap: "0.2rem",
              }}>
                <span style={{ fontSize: "1rem" }}>🏋️</span>
                <span style={{
                  fontSize: "0.55rem",
                  fontFamily: "DM Sans, sans-serif",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-subtle)",
                }}>
                  Workout
                </span>
              </div>

              {/* Day cells */}
              {weekDates.map((date, dayIdx) => {
                const ds = formatDateLocal(date);
                const isToday = ds === todayStr;
                const pw = getPlannedForDate(date);
                const status = pw?.status ?? "planned";
                return (
                  <div key={`${dayIdx}-workout`} style={{
                    padding: "0.375rem",
                    borderTop: "1px solid var(--app-border)",
                    borderLeft: "1px solid var(--app-border)",
                    background: isToday ? "rgba(185,90,16,0.04)" : "transparent",
                    minHeight: 90,
                    display: "flex",
                    alignItems: "stretch",
                  }}>
                    {pw ? (
                      <div style={{
                        width: "100%",
                        borderRadius: 10,
                        padding: "0.5rem",
                        background:
                          status === "completed" ? "rgba(138,180,160,0.08)" :
                          status === "skipped" ? "rgba(255,255,255,0.03)" :
                          "rgba(168,196,224,0.06)",
                        border: `1px solid ${
                          status === "completed" ? "rgba(138,180,160,0.25)" :
                          status === "skipped" ? "rgba(255,255,255,0.07)" :
                          "rgba(168,196,224,0.2)"}`
                      }}>
                        <button
                          onClick={() => handleDeleteScheduled(pw.id)}
                          className="plan-remove-btn"
                          style={{
                            position: "absolute",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#cbd5e1",
                            fontSize: "0.7rem",
                            lineHeight: 1,
                            padding: 2,
                            borderRadius: 4,
                          }}
                          title="Remove"
                          aria-label="Remove workout"
                        >
                          ✕
                        </button>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                          <div>
                            <div style={{ fontSize: "0.8rem", fontFamily: "DM Sans, sans-serif", fontWeight: 600, color: status === "completed" ? "#8ab4a0" : "var(--parchment)", lineHeight: 1.2 }}>
                              {getWorkoutName(pw.workoutId)}
                            </div>
                            {pw.time && (
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                                {pw.time}
                              </div>
                            )}
                          </div>
                          <div style={{ flexShrink: 0 }}>
                            {status === "completed" && <span className="status-pill completed">✓ Done</span>}
                            {status === "skipped" && <span className="status-pill skipped">Skipped</span>}
                          </div>
                        </div>
                        {status === "planned" && (
                          <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.5rem" }}>
                            <button
                              className="btn-app-primary"
                              onClick={() => handleStatusChange(pw, "completed")}
                              title="Mark completed"
                            >
                              <Check size={12} /> Done
                            </button>
                            <button
                              className="btn-app-secondary"
                              onClick={() => handleStatusChange(pw, "skipped")}
                            >
                              Skip
                            </button>
                            <button
                              className="btn-app-ghost"
                              onClick={() => openLogFor(pw)}
                            >
                              Log
                            </button>
                          </div>
                        )}
                        {status === "completed" && (
                          <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.5rem" }}>
                            <button className="btn-app-ghost" onClick={() => openLogFor(pw)}>Edit log</button>
                            <button className="btn-app-secondary" onClick={() => handleStatusChange(pw, "planned")}>Undo</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleAddOnDate(date)}
                        className="plan-add-btn"
                        style={{
                          width: "100%",
                          minHeight: 70,
                          background: "transparent",
                          border: "1.5px dashed var(--app-border)",
                          color: "var(--text-subtle)",
                          borderRadius: 10,
                          cursor: "pointer",
                          fontSize: "1.125rem",
                          transition: "all 0.15s",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        title={`Add workout`}
                      >
                        <Plus size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </>
          </div>
        </div>
      </div>

      <div className="workouts-layout">
        <div className="workouts-list">
          <h2>Library</h2>
          {workouts.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No workouts yet. Add your first workout!</p>
          ) : (
            workouts.map(workout => (
              <div 
                key={workout.id} 
                className={`workout-card ${selectedWorkout?.id === workout.id ? 'selected' : ''}`}
                onClick={() => handleViewDetails(workout)}
              >
                <h3>{workout.name}</h3>
                <div className="workout-info">
                  {workout.exercises.length} exercises
                </div>
                <button 
                  className="btn-app-ghost schedule-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSchedule(workout);
                  }}
                >
                  📅 Schedule
                </button>
              </div>
            ))
          )}

          <div className="scheduled-section">
            <h2>Scheduled</h2>
            {getScheduledWorkouts().length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No workouts scheduled</p>
            ) : (
              getScheduledWorkouts().map(pw => (
                <div key={pw.id} className="scheduled-card">
                  <div className="scheduled-date">
                    {new Date(pw.date).toLocaleDateString('en-AU', { 
                      weekday: 'short',
                      month: 'short', 
                      day: 'numeric' 
                    })}
                    {pw.time && ` at ${pw.time}`}
                  </div>
                  <div className="scheduled-name">{pw.workout?.name || "Unknown"}</div>
                  <button 
                    className="remove-btn"
                    onClick={() => handleDeleteScheduled(pw.id)}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="workout-details">
          {!selectedWorkout ? (
            <div className="empty-state">
              <p>Select a workout to view details or add a new one</p>
            </div>
          ) : isEditing ? (
            <WorkoutForm 
              workout={selectedWorkout}
              onChange={setSelectedWorkout}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          ) : (
            <WorkoutView 
              workout={selectedWorkout}
              onEdit={() => handleEdit(selectedWorkout)}
              onDelete={() => handleDelete(selectedWorkout.id)}
            />
          )}
        </div>
      </div>

      {showScheduleModal && selectedWorkout && (
        <ScheduleModal
          workoutName={selectedWorkout.name}
          onSave={handleSaveSchedule}
          onCancel={() => setShowScheduleModal(false)}
        />
      )}

      {showQuickScheduleModal && (
        <QuickScheduleModal
          workouts={workouts}
          date={quickScheduleDate}
          onSave={(workoutId: string, time: string) => {
            const planned: PlannedWorkout = {
              id: uuidv4(),
              date: quickScheduleDate,
              workoutId,
              time: time || undefined,
              status: "planned",
            };
            addPlannedWorkout(planned);
            setShowQuickScheduleModal(false);
            loadData();
          }}
          onCancel={() => setShowQuickScheduleModal(false)}
        />
      )}

      {showLogModal && logPlannedId && (() => {
        const pw = plannedWorkouts.find(p => p.id === logPlannedId);
        const workout = workouts.find(w => w.id === pw?.workoutId);
        if (!pw || !workout) return null;
        return (
          <LogProgressModal
            workout={workout}
            onSave={(entries) => {
              saveWorkoutProgress({
                plannedWorkoutId: pw.id,
                performedAt: new Date().toISOString(),
                entries,
              });
              setShowLogModal(false);
              loadData();
            }}
            onCancel={() => setShowLogModal(false)}
          />
        );
      })()}
    </div>
  );
}

interface WorkoutFormProps {
  workout: Workout;
  onChange: (workout: Workout) => void;
  onSave: () => void;
  onCancel: () => void;
}

function WorkoutForm({ workout, onChange, onSave, onCancel }: WorkoutFormProps) {
  const handleAddExercise = () => {
    onChange({
      ...workout,
      exercises: [...workout.exercises, { 
        id: uuidv4(), 
        name: "", 
        sets: 3, 
        reps: "10" 
      }]
    });
  };

  const handleRemoveExercise = (id: string) => {
    onChange({
      ...workout,
      exercises: workout.exercises.filter(e => e.id !== id)
    });
  };

  return (
    <div className="workout-form">
      <h2>{workout.name || "New Workout"}</h2>
      
      <div className="form-group">
        <label className="app-label">Name *</label>
        <input
          type="text"
          className="app-input"
          value={workout.name}
          onChange={e => onChange({ ...workout, name: e.target.value })}
          placeholder="Workout name"
        />
      </div>

      <div className="form-section">
        <div className="section-header">
          <h3>Exercises</h3>
          <button className="btn-app-ghost" onClick={handleAddExercise}>+ Add</button>
        </div>
        {workout.exercises.map((ex, idx) => (
          <div key={ex.id} className="exercise-row">
            <input
              type="text"
              className="app-input"
              value={ex.name}
              onChange={e => {
                const newExs = [...workout.exercises];
                newExs[idx] = { ...newExs[idx], name: e.target.value };
                onChange({ ...workout, exercises: newExs });
              }}
              placeholder="Exercise name"
              style={{ flex: 2 }}
            />
            <input
              type="number"
              className="app-input"
              value={ex.sets || ""}
              onChange={e => {
                const newExs = [...workout.exercises];
                newExs[idx] = { ...newExs[idx], sets: e.target.value ? parseInt(e.target.value) : undefined };
                onChange({ ...workout, exercises: newExs });
              }}
              placeholder="Sets"
              style={{ width: "80px" }}
            />
            <input
              type="text"
              className="app-input"
              value={ex.reps || ""}
              onChange={e => {
                const newExs = [...workout.exercises];
                newExs[idx] = { ...newExs[idx], reps: e.target.value };
                onChange({ ...workout, exercises: newExs });
              }}
              placeholder="Reps"
              style={{ width: "100px" }}
            />
            <input
              type="text"
              className="app-input"
              value={ex.load || ""}
              onChange={e => {
                const newExs = [...workout.exercises];
                newExs[idx] = { ...newExs[idx], load: e.target.value };
                onChange({ ...workout, exercises: newExs });
              }}
              placeholder="Load"
              style={{ flex: 1 }}
            />
            <button 
              className="btn-app-secondary btn-danger"
              onClick={() => handleRemoveExercise(ex.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="form-actions">
        <button className="btn-app-primary" onClick={onSave}>Save</button>
        <button className="btn-app-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

interface WorkoutViewProps {
  workout: Workout;
  onEdit: () => void;
  onDelete: () => void;
}

function WorkoutView({ workout, onEdit, onDelete }: WorkoutViewProps) {
  return (
    <div className="workout-view">
      <div className="view-header">
        <h2>{workout.name}</h2>
        <div className="view-actions">
          <button className="btn-app-primary" onClick={onEdit}>Edit</button>
          <button className="btn-app-secondary btn-danger" onClick={onDelete}>Delete</button>
        </div>
      </div>

      {workout.exercises.length > 0 && (
        <div className="view-section">
          <h3>Exercises</h3>
          <table className="exercise-table">
            <thead>
              <tr>
                <th>Exercise</th>
                <th>Sets</th>
                <th>Reps</th>
                <th>Load</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {workout.exercises.map(ex => (
                <tr key={ex.id}>
                  <td><strong>{ex.name}</strong></td>
                  <td>{ex.sets || "-"}</td>
                  <td>{ex.reps || "-"}</td>
                  <td>{ex.load || "-"}</td>
                  <td>{ex.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface ScheduleModalProps {
  workoutName: string;
  onSave: (date: string, time: string) => void;
  onCancel: () => void;
}

function ScheduleModal({ workoutName, onSave, onCancel }: ScheduleModalProps) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState("18:00");

  const handleSave = () => {
    if (!date) {
      alert("Please select a date");
      return;
    }
    onSave(date, time);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Schedule Workout</h2>
        <p><strong>{workoutName}</strong></p>
        <div className="form-group">
          <label className="app-label">Date</label>
          <input 
            type="date"
            className="app-input"
            value={date} 
            onChange={e => setDate(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="app-label">Time (optional)</label>
          <input 
            type="time"
            className="app-input"
            value={time} 
            onChange={e => setTime(e.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button className="btn-app-primary" onClick={handleSave}>Schedule</button>
          <button className="btn-app-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Quick schedule modal (pick workout + time) ───────────────────────────────────
interface QuickScheduleModalProps {
  workouts: Workout[];
  date: string;
  onSave: (workoutId: string, time: string) => void;
  onCancel: () => void;
}

function QuickScheduleModal({ workouts, date, onSave, onCancel }: QuickScheduleModalProps) {
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string>(workouts[0]?.id ?? "");
  const [time, setTime] = useState("18:00");

  const handleSave = () => {
    if (!selectedWorkoutId) {
      alert("Please choose a workout");
      return;
    }
    onSave(selectedWorkoutId, time);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Schedule for {date}</h2>
        <div className="form-group">
          <label className="app-label">Workout</label>
          <select className="app-input" value={selectedWorkoutId} onChange={e => setSelectedWorkoutId(e.target.value)}>
            {workouts.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="app-label">Time (optional)</label>
          <input type="time" className="app-input" value={time} onChange={e => setTime(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn-app-primary" onClick={handleSave}>Save</button>
          <button className="btn-app-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Log progress modal ───────────────────────────────────────────────────────────
interface LogProgressModalProps {
  workout: Workout;
  onSave: (entries: WorkoutProgressEntry[]) => void;
  onCancel: () => void;
}

function LogProgressModal({ workout, onSave, onCancel }: LogProgressModalProps) {
  const [entries, setEntries] = useState<WorkoutProgressEntry[]>(
    workout.exercises.map(ex => ({
      exerciseId: ex.id,
      setsCompleted: ex.sets,
      topSetReps: ex.reps ? parseInt(String(ex.reps).split("-").pop() || "0", 10) || undefined : undefined,
      topSetWeight: "",
      notes: "",
    }))
  );

  const updateEntry = (idx: number, patch: Partial<WorkoutProgressEntry>) => {
    const next = [...entries];
    next[idx] = { ...next[idx], ...patch };
    setEntries(next);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Log Progress</h2>
        <p style={{ marginTop: 0, color: "var(--text-muted)" }}><strong>{workout.name}</strong></p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "60vh", overflow: "auto", paddingRight: "0.25rem" }}>
          {workout.exercises.map((ex, i) => (
            <div key={ex.id} className="app-card" style={{ padding: "0.75rem" }}>
              <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>{ex.name}</div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <div>
                  <label className="app-label" style={{ fontSize: "0.7rem" }}>Sets</label>
                  <input
                    type="number"
                    className="app-input"
                    style={{ width: 90 }}
                    value={entries[i].setsCompleted ?? ""}
                    onChange={e => updateEntry(i, { setsCompleted: e.target.value ? parseInt(e.target.value) : undefined })}
                  />
                </div>
                <div>
                  <label className="app-label" style={{ fontSize: "0.7rem" }}>Top set reps</label>
                  <input
                    type="number"
                    className="app-input"
                    style={{ width: 120 }}
                    value={entries[i].topSetReps ?? ""}
                    onChange={e => updateEntry(i, { topSetReps: e.target.value ? parseInt(e.target.value) : undefined })}
                  />
                </div>
                <div>
                  <label className="app-label" style={{ fontSize: "0.7rem" }}>Top set weight</label>
                  <input
                    type="text"
                    className="app-input"
                    style={{ width: 140 }}
                    placeholder="e.g. 22.5kg"
                    value={entries[i].topSetWeight ?? ""}
                    onChange={e => updateEntry(i, { topSetWeight: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ marginTop: "0.35rem" }}>
                <label className="app-label" style={{ fontSize: "0.7rem" }}>Notes</label>
                <input
                  type="text"
                  className="app-input"
                  placeholder="Optional notes"
                  value={entries[i].notes ?? ""}
                  onChange={e => updateEntry(i, { notes: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn-app-primary" onClick={() => onSave(entries)}>Save log</button>
          <button className="btn-app-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
