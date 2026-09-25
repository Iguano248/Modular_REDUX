import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier
from sklearn.preprocessing import OneHotEncoder
import joblib


def entrenar():
    df = pd.read_csv('datos_usuarios.csv')

    X = df.drop('plan_recomendado', axis=1)
    y = df['plan_recomendado']

    categorical_features = ['nivel_actividad', 'patologias', 'objetivo']
    numerical_features = ['edad', 'peso', 'estatura']

    ohe = OneHotEncoder(handle_unknown='ignore', sparse_output=False)
    X_categorical = ohe.fit_transform(X[categorical_features])

    X_final = pd.concat([X[numerical_features],
                         pd.DataFrame(X_categorical, columns=ohe.get_feature_names_out(categorical_features))], axis=1)

    X_train, X_test, y_train, y_test = train_test_split(X_final, y, test_size=0.2, random_state=42)

    model = DecisionTreeClassifier(random_state=42)
    model.fit(X_train, y_train)

    accuracy = model.score(X_test, y_test)
    print(f"Precisión del modelo en el conjunto de prueba: {accuracy:.2f}")

    joblib.dump(model, 'modelo_recomendacion.pkl')
    joblib.dump(ohe, 'encoder_ohe.pkl')

    print("Modelo y codificador guardados con éxito.")


if __name__ == '__main__':
    entrenar()