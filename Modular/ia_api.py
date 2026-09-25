from flask import Flask, request, jsonify
from usar_modelo import recomendar_plan_final

app = Flask(__name__)


# 🔥 Generador de plan detallado
def generar_plan_detallado(tipo):
    planes = {
        "proteinas": {
            "desayuno": "Huevos con avena y fruta",
            "colacion_1": "Yogur griego con nueces",
            "comida": "Pollo con arroz y verduras",
            "colacion_2": "Barra de proteína y una manzana",
            "cena": "Atún con ensalada"
        },
        "mediterranea": {
            "desayuno": "Pan integral con aceite de oliva y tomate",
            "colacion_1": "Frutos secos y una fruta",
            "comida": "Pescado con verduras al vapor",
            "colacion_2": "Hummus con palitos de zanahoria",
            "cena": "Ensalada con queso feta y aceitunas"
        },
        "vegana": {
            "desayuno": "Avena con leche de almendras y fruta",
            "colacion_1": "Mix de semillas y fruta deshidratada",
            "comida": "Lentejas con arroz y verduras",
            "colacion_2": "Tahini con bastones de apio",
            "cena": "Ensalada de garbanzos con aguacate"
        },
        "balanceada": {
            "desayuno": "Cereal integral con leche y fruta",
            "colacion_1": "Yogur con granola",
            "comida": "Carne con arroz y ensalada",
            "colacion_2": "Fruta fresca y un puñado de almendras",
            "cena": "Sopa de verduras y pan integral"
        },
        "sin_gluten": {
            "desayuno": "Fruta con yogurt sin gluten",
            "colacion_1": "Rice cakes con aguacate",
            "comida": "Pollo con verduras y arroz",
            "colacion_2": "Fruta seca sin azúcar añadida",
            "cena": "Ensalada con proteína y semillas de chía"
        }
    }

    return planes.get(tipo, planes["balanceada"])


# 🔥 Endpoint principal
@app.route('/recomendar', methods=['POST'])
def recomendar():
    data = request.json

    try:
        # 🔹 Paso 1: IA devuelve tipo de dieta
        tipo = recomendar_plan_final(
            edad=int(data['edad']),
            peso=float(data['peso']),
            estatura=float(data['estatura']),
            nivel_actividad=data['actividad'],
            patologias=data['patologias'],
            objetivo=data['objetivo'],
            ingredientes_evitar=data.get('ingredientes_evitar', '')
        )

        # 🔹 Paso 2: Generar plan detallado
        plan = generar_plan_detallado(tipo)

        # 🔹 Paso 3: Respuesta completa
        return jsonify({
            "tipo": tipo,
            "plan": plan
        })

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500


if __name__ == '__main__':
    app.run(port=5000)