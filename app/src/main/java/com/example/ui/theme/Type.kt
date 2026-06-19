package com.example.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val FontFamilyHeadline = FontFamily.Default
val FontFamilyBody = FontFamily.Default

val TextStyleBody = TextStyle(
    fontFamily = FontFamilyBody,
    fontWeight = FontWeight.Normal,
    fontSize = 15.sp,
    lineHeight = 22.sp,
    letterSpacing = 0.15.sp
)

val Typography = Typography(
    bodyLarge = TextStyleBody,
    titleLarge = TextStyle(
        fontFamily = FontFamilyHeadline,
        fontWeight = FontWeight.Bold,
        fontSize = 22.sp,
        lineHeight = 28.sp,
        letterSpacing = 0.sp
    )
)
