from flask import Flask, request, jsonify
from usar_modelo import recomendar_plan_final
import random
import time

app = Flask(__name__)

# BANCO DE ALIMENTOS REALES POR GRUPO SMAE
BANCO = {
    "cereales": [
        {"nombre": "Avena cocida con agua", "g_base": 40},
        {"nombre": "Tortilla de maíz", "g_base": 30},
        {"nombre": "Arroz integral cocido", "g_base": 65},
        {"nombre": "Pan integral tostado", "g_base": 40},
        {"nombre": "Papa cocida en cubos", "g_base": 75},
        {"nombre": "Camote cocido en cubos", "g_base": 70},
        {"nombre": "Quinoa cocida", "g_base": 65},
        {"nombre": "Avena en hojuelas cocida", "g_base": 40},
    ],
    "proteinas_aoa": [
        {"nombre": "Huevo revuelto a la plancha", "g_base": 50},
        {"nombre": "Pechuga de pollo a la plancha", "g_base": 30},
        {"nombre": "Filete de pescado blanco al horno", "g_base": 40},
        {"nombre": "Atún en agua escurrido", "g_base": 40},
        {"nombre": "Carne de res magra a la plancha", "g_base": 30},
        {"nombre": "Queso panela en cubos", "g_base": 40},
        {"nombre": "Surimi al natural", "g_base": 50},
        {"nombre": "Huevo cocido", "g_base": 50},
        {"nombre": "Pavo a la plancha", "g_base": 30},
    ],
    "verduras": [
        {"nombre": "Jitomate, cebolla y pepino picados", "g_base": 100},
        {"nombre": "Brócoli y calabacita al vapor", "g_base": 100},
        {"nombre": "Espinacas salteadas con ajo", "g_base": 100},
        {"nombre": "Coliflor, zanahoria y ejote al vapor", "g_base": 100},
        {"nombre": "Champiñones, pimiento morrón y cebolla salteados", "g_base": 100},
        {"nombre": "Lechuga romana, rúcula y jitomate cherry", "g_base": 100},
        {"nombre": "Repollo morado y zanahoria rallados", "g_base": 100},
        {"nombre": "Nopal asado o cocido en tiras", "g_base": 100},
    ],
    "frutas": [
        {"nombre": "Manzana con cáscara", "g_base": 70},
        {"nombre": "Naranja pelada", "g_base": 100},
        {"nombre": "Plátano", "g_base": 50},
        {"nombre": "Papaya en cubos", "g_base": 120},
        {"nombre": "Fresas frescas", "g_base": 120},
        {"nombre": "Melón en cubos", "g_base": 120},
        {"nombre": "Sandía en cubos", "g_base": 120},
        {"nombre": "Kiwi pelado", "g_base": 70},
        {"nombre": "Guayaba", "g_base": 70},
    ],
    "lacteos": [
        {"nombre": "Leche descremada", "g_base": 100},
        {"nombre": "Yogur natural descremado", "g_base": 80},
        {"nombre": "Yogur griego light", "g_base": 70},
        {"nombre": "Queso cottage bajo en grasa", "g_base": 70},
    ],
    "grasas": [
        {"nombre": "Aceite de oliva virgen extra", "g_base": 5},
        {"nombre": "Aguacate en rebanadas", "g_base": 30},
        {"nombre": "Almendras crudas", "g_base": 10},
        {"nombre": "Nueces", "g_base": 10},
        {"nombre": "Semillas de chía", "g_base": 5},
        {"nombre": "Semillas de linaza molidas", "g_base": 5},
        {"nombre": "Cacahuates naturales sin sal", "g_base": 10},
    ]
}

def obtener_equivalentes(data):
    objetivo = str(data.get('objetivo', '')).lower()
    if "bajar" in objetivo or "perder" in objetivo:
        return {
            "desayuno": {"cereales": 1, "proteinas_aoa": 1, "frutas": 1, "grasas": 0.5},
            "colacion_1": {"frutas": 1},
            "comida": {"cereales": 1, "proteinas_aoa": 2, "verduras": 2, "grasas": 1},
            "colacion_2": {"frutas": 1, "grasas": 0.5},
            "cena": {"proteinas_aoa": 1, "verduras": 2, "grasas": 0.5}
        }
    elif "subir" in objetivo or "ganar" in objetivo:
        return {
            "desayuno": {"cereales": 2, "proteinas_aoa": 1, "lacteos": 1, "frutas": 1, "grasas": 1},
            "colacion_1": {"frutas": 1, "lacteos": 1, "grasas": 0.5},
            "comida": {"cereales": 2, "proteinas_aoa": 2, "verduras": 2, "grasas": 1},
            "colacion_2": {"frutas": 1, "lacteos": 1, "grasas": 0.5},
            "cena": {"cereales": 1, "proteinas_aoa": 1, "verduras": 2, "grasas": 1}
        }
    else:
        return {
            "desayuno": {"cereales": 2, "proteinas_aoa": 1, "frutas": 1, "grasas": 0.5},
            "colacion_1": {"frutas": 1},
            "comida": {"cereales": 2, "proteinas_aoa": 2, "verduras": 2, "grasas": 1},
            "colacion_2": {"frutas": 1, "grasas": 0.5},
            "cena": {"cereales": 1, "proteinas_aoa": 1, "verduras": 2, "grasas": 0.5}
        }

def armar_plan_desde_cero(data):
    rng = random.Random(time.time_ns() * random.randint(100000, 999999))
    eq = obtener_equivalentes(data)
    plan = {}

    for comida, grupos in eq.items():
        partes = []

        if grupos.get("cereales", 0) > 0:
            elegido = rng.choice(BANCO["cereales"])
            eqn = grupos["cereales"]
            gramos = int(round(elegido["g_base"] * eqn))
            partes.append(f"{gramos} g de {elegido['nombre']}")

        if grupos.get("proteinas_aoa", 0) > 0:
            elegido = rng.choice(BANCO["proteinas_aoa"])
            eqn = grupos["proteinas_aoa"]
            gramos = int(round(elegido["g_base"] * eqn))
            partes.append(f"{gramos} g de {elegido['nombre']}")

        if grupos.get("lacteos", 0) > 0:
            elegido = rng.choice(BANCO["lacteos"])
            eqn = grupos["lacteos"]
            gramos = int(round(elegido["g_base"] * eqn))
            partes.append(f"{gramos} g de {elegido['nombre']}")

        if grupos.get("verduras", 0) > 0:
            cant = int(grupos["verduras"])
            if cant >= 1 and len(BANCO["verduras"]) >= cant:
                elegidas = rng.sample(BANCO["verduras"], cant)
            else:
                elegidas = rng.sample(BANCO["verduras"], len(BANCO["verduras"]))
            for v in elegidas:
                partes.append(f"{v['g_base']} g de {v['nombre']}")

        if grupos.get("frutas", 0) > 0:
            elegido = rng.choice(BANCO["frutas"])
            eqn = grupos["frutas"]
            gramos = int(round(elegido["g_base"] * eqn))
            partes.append(f"{gramos} g de {elegido['nombre']}")

        if grupos.get("grasas", 0) > 0:
            elegido = rng.choice(BANCO["grasas"])
            eqn = grupos["grasas"]
            gramos = int(round(elegido["g_base"] * eqn))
            partes.append(f"{gramos} g de {elegido['nombre']}")

        plan[comida] = ", ".join(partes)

    return plan

@app.route('/recomendar', methods=['POST'])
def recomendar():
    try:
        data = request.json or {}
        tipo = recomendar_plan_final(
            edad=int(data['edad']),
            peso=float(data['peso']),
            estatura=float(data['estatura']),
            nivel_actividad=data['actividad'],
            patologias=data['patologias'],
            objetivo=data['objetivo'],
            ingredientes_evitar=data.get('ingredientes_evitar', '')
        )
        plan = armar_plan_desde_cero(data)
        return jsonify({"tipo": tipo, "plan": plan})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000)
