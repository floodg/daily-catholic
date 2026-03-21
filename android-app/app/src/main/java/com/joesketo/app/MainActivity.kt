package com.joesketo.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.joesketo.app.data.repository.AuthRepository
import com.joesketo.app.data.repository.MockAgendaRepository
import com.joesketo.app.ui.login.LoginScreen
import com.joesketo.app.ui.login.LoginViewModel
import com.joesketo.app.ui.theme.JoesKetoTheme
import com.joesketo.app.ui.today.TodayScreen
import com.joesketo.app.ui.today.TodayViewModel
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch

private const val ROUTE_LOGIN = "login"
private const val ROUTE_TODAY = "today"

class MainActivity : ComponentActivity() {

    private val authRepository by lazy { AuthRepository(applicationContext) }
    private val agendaRepository = MockAgendaRepository()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            JoesKetoTheme {
                val navController = rememberNavController()

                // Local copy of the access token — also seeded from DataStore on startup
                var accessToken by rememberSaveable { mutableStateOf<String?>(null) }
                val storedToken by authRepository.accessToken.collectAsState(initial = null)

                // Navigate to Today if a stored session already exists
                LaunchedEffect(storedToken) {
                    if (storedToken != null && accessToken == null) {
                        accessToken = storedToken
                        navController.navigate(ROUTE_TODAY) {
                            popUpTo(ROUTE_LOGIN) { inclusive = true }
                        }
                    }
                }

                NavHost(
                    navController = navController,
                    startDestination = ROUTE_LOGIN
                ) {
                    composable(ROUTE_LOGIN) {
                        val loginViewModel: LoginViewModel = viewModel(
                            factory = LoginViewModel.Factory(applicationContext)
                        )
                        LoginScreen(
                            viewModel = loginViewModel,
                            onLoginSuccess = { token ->
                                accessToken = token
                                navController.navigate(ROUTE_TODAY) {
                                    popUpTo(ROUTE_LOGIN) { inclusive = true }
                                }
                            }
                        )
                    }

                    composable(ROUTE_TODAY) {
                        val token = accessToken ?: ""
                        val todayViewModel: TodayViewModel = viewModel(
                            factory = TodayViewModel.Factory(agendaRepository, token)
                        )
                        TodayScreen(
                            viewModel = todayViewModel,
                            onSignOut = {
                                accessToken = null
                                MainScope().launch { authRepository.signOut() }
                                navController.navigate(ROUTE_LOGIN) {
                                    popUpTo(ROUTE_TODAY) { inclusive = true }
                                }
                            }
                        )
                    }
                }
            }
        }
    }
}
