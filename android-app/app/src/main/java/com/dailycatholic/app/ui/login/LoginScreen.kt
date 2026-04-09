package com.dailycatholic.app.ui.login

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.dailycatholic.app.ui.theme.AppBg
import com.dailycatholic.app.ui.theme.AppBorderGold
import com.dailycatholic.app.ui.theme.AppSurface
import com.dailycatholic.app.ui.theme.AuthErrorBorder
import com.dailycatholic.app.ui.theme.AuthErrorText
import com.dailycatholic.app.ui.theme.AuthErrorBg
import com.dailycatholic.app.ui.theme.Gold
import com.dailycatholic.app.ui.theme.Parchment
import com.dailycatholic.app.ui.theme.TextMuted
import com.dailycatholic.app.ui.theme.TextSubtle

@Composable
fun LoginScreen(
    viewModel: LoginViewModel,
    onLoginSuccess: (accessToken: String) -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()

    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(uiState) {
        if (uiState is LoginUiState.Success) {
            onLoginSuccess((uiState as LoginUiState.Success).accessToken)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AppBg)
            .padding(horizontal = 24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, AppBorderGold, RoundedCornerShape(16.dp))
                .background(AppSurface, RoundedCornerShape(16.dp))
                .padding(horizontal = 24.dp, vertical = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "✝ Daily Catholic",
                style = MaterialTheme.typography.displaySmall,
                color = Parchment,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "Sign In",
                style = MaterialTheme.typography.bodyMedium,
                color = TextMuted,
                fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(24.dp))

            if (uiState is LoginUiState.Error) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(AuthErrorBg, RoundedCornerShape(10.dp))
                        .border(1.dp, AuthErrorBorder, RoundedCornerShape(10.dp))
                        .padding(12.dp),
                ) {
                    Text(
                        text = (uiState as LoginUiState.Error).message,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuthErrorText,
                    )
                }
                Spacer(modifier = Modifier.height(16.dp))
            }

            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email", color = TextSubtle) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next,
                ),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Parchment,
                    unfocusedTextColor = Parchment,
                    focusedBorderColor = Gold,
                    unfocusedBorderColor = TextSubtle,
                    focusedLabelColor = Gold,
                    unfocusedLabelColor = TextMuted,
                    cursorColor = Gold,
                ),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password", color = TextSubtle) },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done,
                ),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Parchment,
                    unfocusedTextColor = Parchment,
                    focusedBorderColor = Gold,
                    unfocusedBorderColor = TextSubtle,
                    focusedLabelColor = Gold,
                    unfocusedLabelColor = TextMuted,
                    cursorColor = Gold,
                ),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(modifier = Modifier.height(20.dp))
            Button(
                onClick = { viewModel.signIn(email, password) },
                enabled = uiState !is LoginUiState.Loading,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(100.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Gold.copy(alpha = 0.18f),
                    contentColor = Gold,
                    disabledContainerColor = Gold.copy(alpha = 0.08f),
                ),
            ) {
                if (uiState is LoginUiState.Loading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        strokeWidth = 2.dp,
                        color = Gold,
                    )
                } else {
                    Text(
                        text = "SIGN IN",
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.padding(vertical = 4.dp),
                    )
                }
            }
        }
    }
}
