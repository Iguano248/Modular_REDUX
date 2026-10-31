# coding: utf-8
import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('trabajador.js','r',encoding='utf-8',errors='ignore') as f:
    s=f.read()
for i,l in enumerate(s.splitlines()[:150],1):
    print(f'{i}: {l}')
