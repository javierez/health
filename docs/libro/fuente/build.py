# Builds ../index.html from libro.html and the drawn exercises (health_sim's exercise_moves, dumped to a TSV).
#   psql …/health_sim -AtF $'\t' -c "select key, name, info->'work', info->>'how' from exercise_moves where status='ready'" > moves.tsv
#   python3 docs/libro/fuente/build.py moves.tsv
import json, os, sys
D = os.path.dirname(os.path.abspath(__file__))
L = {"pecho":"Pecho","espalda":"Espalda","hombros":"Hombros","trapecio":"Trapecio","lumbares":"Lumbares","biceps":"Bíceps","triceps":"Tríceps","antebrazos":"Antebrazos","abdomen":"Abdomen","oblicuos":"Oblicuos","gluteos":"Glúteos","cuadriceps":"Cuádriceps","isquios":"Isquios","aductores":"Aductores","gemelos":"Gemelos","tibial":"Tibial"}
# The leg routine in order, then the rest.
ORDER = ["sentadilla-isometrica-en-pared", "sentadilla-isometrica-en-pared-a-una-pie", "zancada-estatica", "puente-de-gluteo-a-una-pierna-con-banda", "oso-a-pica", "sentadilla-a-una-pierna-con-fitball", "zancada-estatica-con-mancuernas", "press-banca", "kettlebell-swing", "turkish-get-up"]
rows = {r[0]: r for r in (l.rstrip("\n").split("\t") for l in open(sys.argv[1]))}
moves = []
for i, k in enumerate(k for k in ORDER if k in rows):
    _, name, work, how = rows[k]
    w = sorted(json.loads(work).items(), key=lambda x: -x[1])
    moves.append({"key": k, "name": name, "how": how, "n": f"{i + 1:02d}" if i < 7 else "", "main": [L[m] for m, v in w if v >= 1], "also": [L[m] for m, v in w if 0.5 <= v < 1]})
out = open(D + "/libro.html").read().replace("/*MOVES*/[]", json.dumps(moves, ensure_ascii=False))
open(D + "/../index.html", "w").write(out)
print(len(moves), "exercises")
