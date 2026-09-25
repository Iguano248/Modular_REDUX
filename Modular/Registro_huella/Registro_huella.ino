#include <Adafruit_Fingerprint.h>
#include <SoftwareSerial.h>

SoftwareSerial mySerial(2, 3);
Adafruit_Fingerprint finger(&mySerial);

String comando = "";
bool enProceso = false;

void setup() {
  Serial.begin(9600);
  mySerial.begin(57600);
  finger.begin(57600);

  Serial.print("Password OK: ");
  Serial.println(finger.verifyPassword());

  finger.getTemplateCount();

  Serial.print("Templates: ");
  Serial.println(finger.templateCount);

  if (!finger.verifyPassword()) {
    Serial.println("ERROR: Sensor no encontrado");
    while (1) { delay(100); }
  }

  finger.getTemplateCount();

  Serial.print("Templates: ");
  Serial.println(finger.templateCount);

  Serial.println("Sistema listo...");
}

void loop() {
  // Escuchar comandos desde Node
  if (Serial.available()) {
    comando = Serial.readStringUntil('\n');
    comando.trim();

    if (comando.startsWith("ENROLL:") && comando.length() > 7) {
      int id = comando.substring(7).toInt();

      if (id < 1 || id > 255) {
        Serial.print("ENROLL:ID_INVALIDO:");
        Serial.println(id);
        return;
      }

      enProceso = true;
      enrollFingerprint(id);
      delay(500);
      enProceso = false;
    }

    else if (comando.startsWith("DELETE:") && comando.length() > 7) {
      int id = comando.substring(7).toInt();
      deleteFingerprint(id);
    }
  }

  // Detectar huellas solo si no esta registrando
  if (!enProceso) {
    detectarHuella();
  }
}

//
// Registro de huella
//
void enrollFingerprint(int id) {

  uint8_t p;

  Serial.println("ENROLL:STEP1");

while (true) {

  uint8_t p = finger.getImage();

  if (p == FINGERPRINT_OK) {
    Serial.println("IMAGE OK");
    break;
  }

  if (p != FINGERPRINT_NOFINGER) {
    Serial.print("ERROR=");
    Serial.println(p);
  }

  delay(200);
}

  Serial.println("ENROLL:STEP2");

  while (finger.getImage() != FINGERPRINT_NOFINGER) {
    delay(100);
  }

  Serial.println("ENROLL:STEP3");

  while (finger.getImage() != FINGERPRINT_OK) {
    delay(100);
  }

  p = finger.image2Tz(2);

  if (p != FINGERPRINT_OK) {
    Serial.println("ENROLL:ERROR");
    return;
  }

  p = finger.createModel();

  if (p != FINGERPRINT_OK) {
    Serial.println("ENROLL:ERROR");
    return;
  }

  p = finger.storeModel(id);

  if (p != FINGERPRINT_OK) {
    Serial.println("ENROLL:ERROR");
    return;
  }

  Serial.println("ENROLL:OK");
}



//
// Deteccion de huella
//
void detectarHuella() {

  uint8_t p = finger.getImage();

  if (p != FINGERPRINT_OK)
    return;

  p = finger.image2Tz();

  if (p != FINGERPRINT_OK)
    return;

  p = finger.fingerSearch();

  if (p != FINGERPRINT_OK)
    return;

  Serial.println(finger.fingerID);

  delay(1000);
}

void deleteFingerprint(int id) {
  uint8_t p = finger.deleteModel(id);

  if (p == FINGERPRINT_OK) {
    Serial.print("DELETE:OK:");
    Serial.println(id);
  } else {
    Serial.print("DELETE:ERROR:");
    Serial.println(p);
  }
}
