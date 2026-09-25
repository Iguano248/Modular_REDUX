import joblib
import pandas as pd
import numpy as np
import sys
import os

# =========================================================================
# 1. BASE DE CONOCIMIENTO (Aval Profesional y Mapeo de Ingredientes)
# =========================================================================

# **AVAL PROFESIONAL:** Este mapeo es la base para el filtrado y debe ser validado por un nutriólogo.
MAPA_INGREDIENTES_PLANES = {
    'mediterranea': ['aceite_oliva', 'pescado', 'frutas', 'verduras', 'lacteos'],
    'proteinas': ['carnes_rojas', 'huevos', 'lacteos', 'legumbres'],
    'balanceada': ['cereales', 'verduras', 'carnes_blancas', 'lacteos'],
    'vegana': ['legumbres', 'verduras', 'semillas', 'frutos_secos'],
    'sin_gluten': ['arroz', 'maiz', 'verduras', 'carnes_blancas'],
}

# Plan de Respaldo: Usado cuando hay un choque de ingredientes.
PLAN_RESPALDO = 'balanceada' 

# =========================================================================
# 2. CARGA DE MODELO Y ENCODER
# =========================================================================
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))

try:
    MODELO_IA = joblib.load(os.path.join(_BASE_DIR, 'modelo_recomendacion.pkl'))
    ENCODER_OHE = joblib.load(os.path.join(_BASE_DIR, 'encoder_ohe.pkl'))
except FileNotFoundError:
    print("FATAL ERROR: Los archivos de modelo ('modelo_recomendacion.pkl' o 'encoder_ohe.pkl') no se encontraron.")
    print("Asegúrate de haber ejecutado 'entrenar_modelo.py' antes de intentar usar el modelo.")
    raise

# =========================================================================
# 3. FUNCIÓN DE FILTRADO (Despreciar Ingredientes)
# =========================================================================

def filtrar_plan(plan_predicho: str, ingredientes_evitar: str) -> str:
    """
    Revisa si el plan predicho entra en conflicto con las aversiones del usuario.
    Retorna el plan predicho o un plan de respaldo si hay conflicto.
    """
    # Si la cadena está vacía o es None, no hay nada que filtrar.
    if not ingredientes_evitar:
        return plan_predicho
    
    # Preprocesar la lista de ingredientes a evitar del usuario (separa por comas y pasa a minúsculas)
    lista_evitar = [item.strip().lower() for item in ingredientes_evitar.split(',') if item.strip()]
    
    # Obtiene los ingredientes asociados al plan predicho
    ingredientes_del_plan = MAPA_INGREDIENTES_PLANES.get(plan_predicho, [])
    
    # Verifica si hay algún ingrediente en el plan que el usuario quiere evitar
    conflicto = any(ingr in lista_evitar for ingr in ingredientes_del_plan)
    
    if conflicto:
        print(f"  [LOG] ⚠️ Conflicto detectado en '{plan_predicho}'. Reajustando a '{PLAN_RESPALDO}'.")
        return PLAN_RESPALDO 
    else:
        return plan_predicho

# =========================================================================
# 4. FUNCIÓN PRINCIPAL DE RECOMENDACIÓN
# =========================================================================

def recomendar_plan_final(edad: int, peso: float, estatura: float, nivel_actividad: str, patologias: str, objetivo: str, ingredientes_evitar: str) -> str:
    """
    Función principal que combina Reglas Duras, Predicción de IA y Filtrado de Ingredientes.
    """
    print(f"\n[INFO] Evaluando usuario: Objetivo='{objetivo}', Patologías='{patologias}', Evitar='{ingredientes_evitar}'")
    
    # =========================================================================
    # A. Aplicación de Reglas Duras (Aval Profesional Mínimo de Seguridad)
    # =========================================================================
    if 'celiaquia' in patologias.lower():
        print("  [LOG] 🛡️ Regla Dura activada: Celiaquía detectada. Recomendación fija: 'sin_gluten'.")
        return 'sin_gluten'  # Override de la IA para seguridad
    
    # =========================================================================
    # B. Preparación de Datos y Predicción de la IA
    # =========================================================================
    
    # 1. Crear DataFrame con los datos del nuevo usuario
    datos_usuario = pd.DataFrame([{
        'edad': edad,
        'peso': peso,
        'estatura': estatura,
        'nivel_actividad': nivel_actividad,
        'patologias': patologias,
        'objetivo': objetivo
    }])
    
    # 2. Definición de las características (deben coincidir con el entrenamiento)
    categorical_features = ['nivel_actividad', 'patologias', 'objetivo']
    numerical_features = ['edad', 'peso', 'estatura']
    
    # 3. Transformación de datos categóricos (usando el encoder entrenado)
    X_categorical = ENCODER_OHE.transform(datos_usuario[categorical_features])
    
    # 4. Unir datos numéricos con los codificados
    X_final = pd.concat([datos_usuario[numerical_features], 
                         pd.DataFrame(X_categorical, columns=ENCODER_OHE.get_feature_names_out(categorical_features))], axis=1)

    # 5. Predicción del Árbol de Decisión
    prediccion_inicial = MODELO_IA.predict(X_final)[0]
    print(f"  [LOG] 🧠 IA Predicción Inicial: '{prediccion_inicial}'")

    # =========================================================================
    # C. Aplicación de Filtrado por Ingredientes (Despreciar)
    # =========================================================================
    plan_final = filtrar_plan(prediccion_inicial, ingredientes_evitar)
    
    return plan_final

# =========================================================================
# 5. DEMOSTRACIÓN DE USO
# =========================================================================

if __name__ == '__main__':
    # --- Caso de Prueba 1: Regla Dura ---
    # Patología crítica (Celiaquía) que debe ignorar la IA
    recomendacion1 = recomendar_plan_final(
        edad=25, peso=65, estatura=1.80, nivel_actividad='alto', 
        patologias='celiaquia', objetivo='ganar_musculo', ingredientes_evitar='lacteos'
    )
    print(f"➡️ RESULTADO FINAL (Celiaquía): {recomendacion1}")
    
    # --- Caso de Prueba 2: Filtrado de Ingredientes ---
    # Usuario quiere perder peso, el modelo puede sugerir 'proteinas', pero el usuario evita lácteos
    recomendacion2 = recomendar_plan_final(
        edad=40, peso=95, estatura=1.70, nivel_actividad='bajo', 
        patologias='ninguna', objetivo='perder_peso', ingredientes_evitar='leche, lacteos, quesos'
    )
    print(f"➡️ RESULTADO FINAL (Filtro): {recomendacion2}")
    
    # --- Caso de Prueba 3: Sin Conflictos ---
    # El modelo predice, y no hay reglas o filtros que interfieran
    recomendacion3 = recomendar_plan_final(
        edad=30, peso=70, estatura=1.65, nivel_actividad='medio', 
        patologias='ninguna', objetivo='mantenerse', ingredientes_evitar='fresas'
    )
    print(f"➡️ RESULTADO FINAL (Sin Conflicto): {recomendacion3}")