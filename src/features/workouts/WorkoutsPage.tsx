import { useEffect, useState } from "react";
import type { Workout, PlannedWorkout } from "../../domain/types";
import { 
  getWorkouts, 
  addWorkout, 
  updateWorkout, 
  deleteWorkout,
  getPlannedWorkouts,
  addPlannedWorkout,
  deletePlannedWorkout 
} from "../../storage/dataService";
import { v4 as uuidv4 } from "../../storage/uuid";

export default function WorkoutsPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  useEffect(() => {
    setWorkouts(getWorkouts());
    setPlannedWorkouts(getPlannedWorkouts());
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

  return (
    <div className="workouts-page">
      <div className="page-header-bar">
        <h1 className="page-title">💪 Workouts</h1>
        <button className="btn-app-primary" onClick={handleAddNew}>
          + Add New Workout
        </button>
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
