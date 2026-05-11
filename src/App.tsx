import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import Layout from './app/Layout'
import Dashboard from './features/Dashboard'
import MealsPage from './features/meals/MealsPage'
import PlanPage from './features/plan/PlanPage'
import WorkoutsPage from './features/workouts/WorkoutsPage'
import ShoppingPage from './features/shopping/ShoppingPage'
import ShoppingTripsPage from './features/shopping-trips/ShoppingTripsPage'
import InventoryPage from './features/inventory/InventoryPage'
import PantryPage from './features/pantry/PantryPage'
import StarterMealsPage from './features/onboarding/StarterMealsPage'
import AccountSettingsPage from './features/settings/AccountSettingsPage'
import AccountDetailsPage from './features/settings/AccountDetailsPage'
import ProgramPage from './features/programs/ProgramPage'
import StoreProductsPage from './features/store-products/StoreProductsPage'
import IngredientProductsPage from './features/ingredient-products/IngredientProductsPage'
import IngredientsPage from './features/ingredients/IngredientsPage'
import Login from './pages/Login'
import Signup from './pages/Signup'
import MagicLinkLogin from './pages/MagicLinkLogin'
import AdminDashboard from './pages/AdminDashboard'
import { AuthProvider, useAuth } from './context/AuthProvider'
import LandingPage from './components/LandingPage'
import FiatModePage from './features/fiat/FiatModePage'
import MacrosPage from './features/macros/MacrosPage'
import WalkDetailPage from './features/walking/WalkDetailPage'

function AuthBootstrapLoading() {
  return (
    <div className="auth-loading" role="status" aria-live="polite">
      <span className="sr-only">Loading application</span>
      <div className="auth-loading-brand">Daily Catholic</div>
      <div className="auth-loading-sacred-divider" aria-hidden>
        <span className="auth-loading-sacred-divider-symbol">✦</span>
      </div>
      <div className="auth-loading-spinner" aria-hidden />
      <p className="auth-loading-msg">Loading…</p>
    </div>
  )
}

function ProtectedRoute() {
  const { session, loading, profile, profileLoading } = useAuth()
  const location = useLocation()

  // Only block on initial load — don't unmount children during token/profile refreshes
  if (loading || (profileLoading && profile === null)) return <AuthBootstrapLoading />
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />

  if (
    profile !== null &&
    !profile.has_completed_onboarding &&
    location.pathname !== '/app/onboarding'
  ) {
    return <Navigate to="/app/onboarding" replace />
  }

  return <Outlet />
}

function AdminRoute() {
  const { session, loading, profile, profileLoading } = useAuth()
  const location = useLocation()

  if (loading || (profileLoading && profile === null)) return <AuthBootstrapLoading />
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  if (profile?.role !== 'admin') return <Navigate to="/app/dashboard" replace />

  return <Outlet />
}

/** Fiat Mode is app-only: requires session (defense in depth with ProtectedRoute). */
function FiatSessionGuard() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <AuthBootstrapLoading />
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/magic-link" element={<MagicLinkLogin />} />
          <Route path="/app" element={<ProtectedRoute />}>
            <Route path="onboarding" element={<StarterMealsPage />} />
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/app/fiat" replace />} />
              <Route element={<FiatSessionGuard />}>
                <Route path="fiat" element={<FiatModePage />} />
              </Route>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="walking/:sessionId" element={<WalkDetailPage />} />
              <Route path="meals" element={<MealsPage />} />
              <Route path="plan" element={<PlanPage />} />
              <Route path="training" element={<ProgramPage />} />
              <Route path="workouts" element={<WorkoutsPage />} />
              <Route path="shopping" element={<ShoppingPage />} />
              <Route path="shopping-trips" element={<ShoppingTripsPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="pantry" element={<PantryPage />} />
              <Route path="macros" element={<MacrosPage />} />
              <Route path="settings" element={<AccountSettingsPage />} />
              <Route path="account" element={<AccountDetailsPage />} />
              <Route path="store-products" element={<StoreProductsPage />} />
              <Route path="ingredients" element={<IngredientsPage />} />
              <Route path="ingredient-products" element={<IngredientProductsPage />} />
            </Route>
          </Route>
          <Route path="/app" element={<AdminRoute />}>
            <Route path="admin" element={<AdminDashboard />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
