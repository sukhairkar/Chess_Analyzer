import urllib.request
import json
import os

files = ['ecoA.json', 'ecoB.json', 'ecoC.json', 'ecoD.json', 'ecoE.json']
base_url = "https://raw.githubusercontent.com/JeffML/eco.json/master/"

combined = {}
for f in files:
    print(f"Downloading {f}...")
    try:
        req = urllib.request.Request(base_url + f, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            combined.update(data)
    except Exception as e:
        print(f"Failed to download {f}: {e}")

with open('eco.json', 'w') as fp:
    json.dump(combined, fp)

print(f"Saved {len(combined)} openings to eco.json")
