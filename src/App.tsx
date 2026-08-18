import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthProvider'

const Layout = lazy(() => import('./app/Layout'))
const Dashboard = lazy(() => import('./features/Dashboard'))
const MealsPage = lazy(() => import('./features/meals/MealsPage'))
const CreateAiMealPage = lazy(() => import('./features/meals/CreateAiMealPage'))
const PlanPage = lazy(() => import('./features/plan/PlanPage'))
const WorkoutsPage = lazy(() => import('./features/workouts/WorkoutsPage'))
const ShoppingPage = lazy(() => import('./features/shopping/ShoppingPageFast'))
const ShoppingTripsPage = lazy(() => import('./features/shopping-trips/ShoppingTripsPage'))
const InventoryPage = lazy(() => import('./features/inventory/InventoryPage'))
const PantryPage = lazy(() => import('./features/pantry/PantryPage'))
const StarterMealsPage = lazy(() => import('./features/onboarding/StarterMealsPage'))
const AccountSettingsPage = lazy(() => import('./features/settings/AccountSettingsPage'))
const AccountDetailsPage = lazy(() => import('./features/settings/AccountDetailsPage'))
const ProgramPage = lazy(() => import('./features/programs/ProgramPage'))
const StoreProductsPage = lazy(() => import('./features/store-products/StoreProductsPage'))
const IngredientProductsPage = lazy(() => import('./features/ingredient-products/IngredientProductsPage'))
const IngredientsPage = lazy(() => import('./features/ingredients/IngredientsPage'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const MagicLinkLogin = lazy(() => import('./pages/MagicLinkLogin'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const LandingPage = lazy(() => import('./components/LandingPage'))
const FiatModePage = lazy(() => import('./features/fiat/FiatModePage'))
const MacrosPage = lazy(() => import('./features/macros/MacrosPage'))
const WalkDetailPage = lazy(() => import('./features/walking/WalkDetailPage'))

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

function AppRoutes() {
  return (
    <Suspense fallback={<AuthBootstrapLoading />}>
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
            <Route path="meals/create-ai" element={<CreateAiMealPage />} />
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
    </Suspense>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App