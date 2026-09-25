import pandas as pd
import numpy as np

# Definimos los datos que nuestro modelo usará para aprender
data = {
    'edad': np.random.randint(20, 60, size=200),
    'peso': np.random.uniform(50, 120, size=200).round(2),
    'estatura': np.random.uniform(1.50, 1.90, size=200).round(2),
    'nivel_actividad': np.random.choice(['bajo', 'medio', 'alto'], size=200),
    'patologias': np.random.choice(['ninguna', 'diabetes', 'hipertension', 'celiaquia'], size=200),
    'objetivo': np.random.choice(['perder_peso', 'ganar_musculo', 'mantenerse'], size=200),
    'plan_recomendado': np.random.choice(['mediterranea', 'proteinas', 'balanceada', 'vegana', 'sin_gluten'], size=200)
}

# Creamos el DataFrame y lo guardamos en un archivo CSV
df = pd.DataFrame(data)
df.to_csv('datos_usuarios.csv', index=False)
print("Dataset 'datos_usuarios.csv' creado con 200 filas.")