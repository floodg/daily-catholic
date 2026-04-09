package com.dailycatholic.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.dailycatholic.app.data.AuthTokenHolder
import com.dailycatholic.app.data.repository.AuthRepository
import com.dailycatholic.app.ui.dashboard.DashboardScreen
import com.dailycatholic.app.ui.dashboard.DashboardViewModel
import com.dailycatholic.app.ui.fiat.FiatModeScreen
import com.dailycatholic.app.ui.fiat.FiatViewModel
import com.dailycatholic.app.ui.login.LoginScreen
import com.dailycatholic.app.ui.login.LoginViewModel
import com.dailycatholic.app.ui.theme.AppSurface
import com.dailycatholic.app.ui.theme.DailyCatholicTheme
import com.dailycatholic.app.ui.theme.Gold
import com.dailycatholic.app.ui.theme.TextMuted
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch

private const val ROUTE_LOGIN = "login"
private const val ROUTE_HOME = "home"

private enum class MainTab { Fiat, Dashboard }

class MainActivity : ComponentActivity() {

    private val authRepository by lazy { AuthRepository(applicationContext) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            DailyCatholicTheme {
                val navController = rememberNavController()
                var accessToken by rememberSaveable { mutableStateOf<String?>(null) }
                val storedToken by authRepository.accessToken.collectAsState(initial = null)

                LaunchedEffect(storedToken) {
                    val t = storedToken
                    if (t != null && accessToken == null) {
                        AuthTokenHolder.accessToken = t
                        accessToken = t
                        navController.navigate(ROUTE_HOME) {
                            popUpTo(ROUTE_LOGIN) { inclusive = true }
                        }
                    }
                }

                fun onSignOut() {
                    accessToken = null
                    AuthTokenHolder.accessToken = null
                    MainScope().launch { authRepository.signOut() }
                    navController.navigate(ROUTE_LOGIN) {
                        popUpTo(ROUTE_HOME) { inclusive = true }
                    }
                }

                NavHost(
                    navController = navController,
                    startDestination = ROUTE_LOGIN,
                ) {
                    composable(ROUTE_LOGIN) {
                        val loginViewModel: LoginViewModel = viewModel(
                            factory = LoginViewModel.Factory(applicationContext),
                        )
                        LoginScreen(
                            viewModel = loginViewModel,
                            onLoginSuccess = { token ->
                                AuthTokenHolder.accessToken = token
                                accessToken = token
                                navController.navigate(ROUTE_HOME) {
                                    popUpTo(ROUTE_LOGIN) { inclusive = true }
                                }
                            },
                        )
                    }
                    composable(ROUTE_HOME) {
                        val fiatVm: FiatViewModel = viewModel(factory = FiatViewModel.Factory())
                        val dashVm: DashboardViewModel = viewModel(factory = DashboardViewModel.Factory())
                        var tab by rememberSaveable { mutableStateOf(MainTab.Fiat) }
                        Scaffold(
                            containerColor = MaterialTheme.colorScheme.background,
                            bottomBar = {
                                NavigationBar(
                                    containerColor = AppSurface,
                                    tonalElevation = 0.dp,
                                ) {
                                    val colors = NavigationBarItemDefaults.colors(
                                        selectedIconColor = Gold,
                                        selectedTextColor = Gold,
                                        unselectedIconColor = TextMuted,
                                        unselectedTextColor = TextMuted,
                                        indicatorColor = Gold.copy(alpha = 0.12f),
                                    )
                                    NavigationBarItem(
                                        selected = tab == MainTab.Fiat,
                                        onClick = { tab = MainTab.Fiat },
                                        icon = { Text("🕊️", style = MaterialTheme.typography.titleMedium) },
                                        label = { Text("Fiat", style = MaterialTheme.typography.labelSmall, color = if (tab == MainTab.Fiat) Gold else TextMuted) },
                                        colors = colors,
                                    )
                                    NavigationBarItem(
                                        selected = tab == MainTab.Dashboard,
                                        onClick = { tab = MainTab.Dashboard },
                                        icon = { Text("✦", style = MaterialTheme.typography.titleMedium) },
                                        label = { Text("Dashboard", style = MaterialTheme.typography.labelSmall, color = if (tab == MainTab.Dashboard) Gold else TextMuted) },
                                        colors = colors,
                                    )
                                }
                            },
                        ) { padding ->
                            Box(Modifier.padding(padding)) {
                                when (tab) {
                                    MainTab.Fiat -> FiatModeScreen(
                                        viewModel = fiatVm,
                                        onSignOut = { onSignOut() },
                                    )
                                    MainTab.Dashboard -> DashboardScreen(
                                        viewModel = dashVm,
                                        onSignOut = { onSignOut() },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
