# Builds ../index.html from parts/ and ../shots/. To redo it with the app on localhost:3100:
#   cd ~/Desktop/health && AUTH_EMAIL=… AUTH_PASSWORD=… SAMPLE_CREAMS=1 node docs/demo/fuente/shoot.cjs
#   (reset-e2e.cjs for the 04-07 «¿Olvidaste tu contraseña?» shots) && python3 docs/demo/fuente/build.py
import os, re, sys
D = os.path.dirname(os.path.abspath(__file__)) + '/parts/'
OUT = '/Users/javierperezgarcia/Desktop/health/docs/demo/'
r = lambda n: open(D + n).read()

def fig(n, c, style=''): return f'<figure{style}><a href="shots/{n}.png"><img src="shots/{n}.png" alt="" loading="lazy"></a><figcaption>{c}</figcaption></figure>'
def grid(cls, items): return f'<div class="shots {cls}">' + ''.join(fig(n, c) for n, c in items) + '</div>'

head = r('head.html').replace('</style>', '  .tag.ex { background:#f3f4f6; color:var(--ink); border:1px dashed #9ca3af }\n' + '  .mvs { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:14px; margin-top:10px }\n  .mv { position:relative; background:#fff; border:1px solid var(--line); border-radius:14px; padding:12px; display:flex; flex-direction:column; gap:4px; font-size:13.5px }\n  .mv small { color:var(--mute); font-size:12px; line-height:1.4 }\n  .mv small b { color:var(--ink); font-weight:600 }\n  .mv a { font-size:11.5px; color:var(--mute) }\n  .mvn { position:absolute; top:10px; left:12px; font-size:12px; color:#9ca3af; font-variant-numeric:tabular-nums }\n  .mvi { position:relative; width:100%; aspect-ratio:3/4; margin-bottom:4px }\n  .mvi span { position:absolute; inset:0; background:var(--src) left/200% 100% no-repeat; clip-path:inset(0 2%) }\n  .mvi span + span { background-position:right; opacity:0; animation:rep 2.4s ease-in-out infinite }\n  @keyframes rep { 0%,35% { opacity:0 } 50%,85% { opacity:1 } 100% { opacity:0 } }\n  @media (prefers-reduced-motion:reduce) { .mvi span + span { display:none } }\n  .bub { max-width:520px; padding:9px 13px; border-radius:16px; font-size:14px; margin:6px 0 }\n  .bub.me { margin-left:auto; background:#111827; color:#fff }\n  .bub.me i { color:#9ca3af; font-style:normal; margin-right:6px }\n  .bub.it { background:#f3f4f6 }\n  .bub.sys { background:#fff; border:1px dashed #9ca3af; color:var(--mute); font:12.5px/1.5 ui-monospace,Menlo,monospace; white-space:pre-wrap; max-width:none }\n  .ok { color:#111827 } .ko { color:#b45309; font-weight:600 }\n</style>')
renders = r('renders.html')
tools = r('tools.html'); rules = r('rules.html')
wa = r('wa.html')
solo = r('solo.html')
entrar = r('entrar.html')
entrar = entrar.replace('{LOGIN}', grid('', [('01-login', 'Any URL without a session lands here'), ('02-login-error', 'Wrong password: «Email o contraseña incorrectos»'), ('03-login-relleno', 'Filled in; the eye shows the password')]))
entrar = entrar.replace('{RESET}', grid('four', [('04-recuperar', 'Your email, then «Enviar código SMS»'), ('05-codigo-incorrecto', 'A wrong code: «Te quedan 4 intentos»'), ('06-codigo', 'A new password without a capital: «Falta una mayúscula»'), ('07-cambiada', 'Done: «Contraseña cambiada. Entra con la nueva.»')]))

nav = [('mapa', 'How it fits together'), ('entrar', 'Entrar'), ('chat', 'Chat'), ('panel', 'Panel'), ('urgente', 'Lo urgente'), ('hoy', 'Hoy'), ('entrenos', 'Entrenos'), ('rutinas', 'Rutinas, vídeo y 3D'), ('gimnasio', 'En el gimnasio'), ('semana', 'Esta semana'), ('comida', 'Comida'), ('productos', 'Piel'), ('bano', 'Baño'), ('bienmal', 'Lo que te hace bien y mal'), ('datos', 'Datos'), ('movil', 'Móvil'), ('whatsapp', 'WhatsApp 621'), ('solo', 'Lo que va solo'), ('estado', 'Estado')]

body = f'''
<main>

<section id="mapa">
  <h2>How it fits together</h2>
  <p class="lead">Two screens and a WhatsApp number. You talk; it notes everything down and nudges you.</p>
  <table>
    <tr><th>Where</th><th>What you do there</th><th>URL</th></tr>
    <tr><td><b>Login</b></td><td>Email and password, like Vesta. Forgot it: a code by SMS.</td><td><code>/login</code></td></tr>
    <tr><td><b>Chat</b></td><td>Talk, send a voice note, a photo or a video. The agent notes it all down.</td><td><code>/</code></td></tr>
    <tr><td><b>Panel</b></td><td>Only the priorities, title only. Details open on click. Every number behind «Datos».</td><td><code>/?ver=panel</code></td></tr>
    <tr><td><b>Cómo te afecta</b></td><td>What does you good and harm, from your own nights.</td><td><code>/?ver=efectos</code></td></tr>
    <tr><td><b>Entrenos</b></td><td>The body this week, how much you lift, every session.</td><td><code>/?ver=entrenos</code></td></tr>
    <tr><td><b>WhatsApp</b></td><td>Morning note, bedtime alert, reminders. You can answer it like the chat.</td><td>+34 621 33 93 27</td></tr>
    <tr><td><b>Background</b></td><td>Nothing to do. WHOOP, Pocket, GitHub and your WhatsApp come in by themselves.</td><td>every 10 min</td></tr>
  </table>
  <p class="note">Every screenshot is the real app on <code>localhost:3100</code>, refreshed on <b>22-oct</b>, logged in with the local <b>test</b> account on a copy of your data (<code>health_sim</code>: your data as of ~18-oct plus today's routine tests). So «Lo urgente» still shows the PAAF and the PET-TAC as they were then; production already has them updated. Marked: test entries <span class="tag ex">prueba</span>, and two <b>mockups</b> drawn with real texts (the WhatsApp phone and the video conversation). The chat screenshots and «Hoy», «Lo que te hace bien y mal» details are from 18-oct.</p>
</section>

{entrar}

<section id="chat">
  <h2>2 · Chat</h2>
  <p class="lead">The main screen. Whatever you'd tell a friend who tracks your health.</p>
  <div class="grid">
    {fig("70-chat", "Today's conversation")}
    <div>
      <h3>Three ways in</h3>
      <ul>
        <li><b>Text</b>: «Escribe o toca el micro».</li>
        <li><b>Voice</b>: the mic. It's transcribed and answered like text.</li>
        <li><b>Photo or video</b>: the camera. A plate, the scale, the pill, the book, a cream. Up to 6 photos at once; on a computer, also paste (⌘V) or drag them in.</li>
      </ul>
      <h3>What you see happen</h3>
      <ul>
        <li>One short bubble per reply, with the count riding on it: «Apuntado, sentadilla 4x6 a 100. Gimnasio: 3 de 4.»</li>
        <li>A photo of a cream or a supplement: it reads the label, saves it (creams in «Piel», supplements in «Comida») and looks up its sheet on the web. Food or a drink, even packaged, is a meal.</li>
      </ul>
    </div>
  </div>
  {grid("", [("72-chat-arriba", "Scrolled to the start of the day"), ("73-chat-escribiendo", "Typing a question (not sent)"), ("74-chat-barra", "The bar: text, camera, send")])}
  {tools}
</section>

<section id="panel">
  <h2>3 · Panel</h2>
  <p class="lead">Calm by design: only the priorities, nothing moves on hover, details open on click.</p>
  {fig("10-panel", "Salud · Domingo, 18 de octubre")}
  <div class="grid" style="margin-top:16px">
    <div>
      {fig("12-cabecera", "Top right: Hablar · Datos · Chat · Cuenta")}
      <table style="margin-top:14px">
        <tr><th>Button</th><th>What it does</th></tr>
        <tr><td><b>Hablar</b></td><td>Tap, say it, tap again: «he hecho yoga 30 minutos». Same agent as the chat; the reply plays out loud and the panel refreshes.</td></tr>
        <tr><td><b>Datos</b></td><td>Every number: Evolución and Día a día (section 9).</td></tr>
        <tr><td><b>Chat</b></td><td>Back to the chat.</td></tr>
        <tr><td><b>Cuenta</b> <span class="tag">new</span></td><td>Your email, «Cambiar contraseña» (signs out the other devices) and «Cerrar sesión».</td></tr>
      </table>
    </div>
    {fig("13-cuenta", "«Cuenta»")}
  </div>
  <table style="margin-top:14px">
    <tr><th>Block</th><th>What it shows</th><th>Click opens</th></tr>
    <tr><td><span class="tag amber">Lo urgente</span></td><td>Medical items still to do</td><td>The item, with «Llamar»; «Historial médico»</td></tr>
    <tr><td><b>Hoy</b></td><td>What's left today, then «Haz» and «Evita»</td><td>Why each row, how it's done, its study</td></tr>
    <tr><td><b>Entrenos</b> <span class="tag">new</span></td><td>The body this week and your latest lifts</td><td>An exercise set by set; «Ver todo» → <code>?ver=entrenos</code></td></tr>
    <tr><td><b>Esta semana</b></td><td>One line per commitment: name, count, 7 dots</td><td>The week of that commitment</td></tr>
    <tr><td><b>Comida</b> <span class="tag">new</span></td><td>Today's kcal; protein and fibre against your target; each meal with your photo; your supplements; the week's average</td><td>A meal: your photos, then food by food with grams and every nutrient</td></tr>
    <tr><td><b>Piel</b> <span class="tag">new</span></td><td>Your creams, each with its 3D icon. Nothing you eat, drink or take</td><td>Its sheet from the web, «Lo he usado hoy», the last 14 days</td></tr>
    <tr><td><b>Lo que te hace bien y mal</b> <span class="tag">new</span></td><td>From your own nights: good on the left, bad on the right</td><td>The numbers behind it; «Ver todo» → <code>?ver=efectos</code></td></tr>
  </table>
  <h3>The whole panel</h3>
  {fig("11-panel-entero", "")}
</section>

<section id="urgente">
  <h2>4 · Lo urgente</h2>
  <p class="lead">At the top whenever your medical history has something pending. Amber is the only colour on the page.</p>
  {fig("20-urgente", "PAAF (with «Llamar») and PET-TAC, both pending")}
  <div class="grid" style="margin-top:16px">
    {fig("21-urgente-paaf", "Click an item → its window, with «Llamar al 900 200 008»")}
    <div>
      {fig("22-urgente-paaf-cerca", "Close-up")}
      <div style="margin-top:14px">{fig("23-urgente-pettac", "PET-TAC: no phone in the text, so no button")}</div>
      <ul style="margin-top:12px">
        <li>Tick it on the right when it's done.</li>
        <li>«Llamar» only appears if the text has a phone number.</li>
        <li>Easier: tell the chat «ya tengo cita para la PAAF el 22».</li>
      </ul>
    </div>
  </div>
  <h3>Historial médico (button on the right)</h3>
  {grid("two", [("24-historial", "Pendiente on top, then Cuello"), ("25-historial-orina", "Orina"), ("26-historial-antecedentes", "Dientes y maxilofacial, Antecedentes, «Añadir a mano»"), ("27-historial-tac", "An entry opened: the TAC report in plain words"), ("28-historial-anadir", "«Añadir a mano»: type, date, topic, title, details")])}
</section>

<section id="hoy">
  <h2>5 · Hoy</h2>
  <p class="lead">What's left today, title only; then what to do («Haz») and what to leave («Evita»), each with its study one click away.</p>
  <div class="grid">
    {fig("30-hoy", '<span class="tag ex">prueba</span> At 17:12: five in sight, in the order of your day; scroll for the rest and «Haz». Amber only for what is behind')}
    <div>
      <table>
        <tr><th>Circle</th><th>Done when</th></tr>
        <tr><td>○</td><td>You tap it, or tell the chat. Nothing asks you for a photo</td></tr>
        <tr><td>dashed</td><td>It ticks itself from WHOOP (bedtime, training)</td></tr>
        <tr><td>none</td><td>«Evita» rows: done by not doing them</td></tr>
      </table>
      <ul style="margin-top:12px">
        <li>The count (0/4) is only your list, not «Haz» and «Evita».</li>
        <li>What's done folds into one line: «Hecho: …».</li>
      </ul>
    </div>
  </div>
  {grid("", [("31-hoy-por-que", "Click a row: the why in one line, how it's ticked"), ("33-hoy-haz", "A «Haz» row: the tip and its source")])}
  {rules}
</section>

<section id="entrenos">
  <h2>0 · Entrenos <span class="tag">new</span></h2>
  <p class="lead">What you train, from what you tell the chat («press banca 80 kg 3x8»). On the panel under «Hoy»; the rest in «Ver todo».</p>
  <div class="grid">
    {fig("34-entrenos", '<span class="tag ex">prueba</span> The card: the body this week and your latest lifts, with what went up (+7,5 kg)')}
    {fig("36-entrenos-ejercicio", '<span class="tag ex">prueba</span> Tap an exercise: the muscles it works and every set, day by day')}
  </div>
  {fig("35-entrenos-vista", '<span class="tag ex">prueba</span> «Ver todo» → <code>?ver=entrenos</code>: zones of the last 7 days, «Cuánto levantas», «Sesiones»', ' style="margin-top:16px"')}
  <ul style="margin-top:12px">
    <li>A zone lights up from the exercise's name («Press banca», «Sentadilla», «Dominadas»…); darker = more days.</li>
    <li>Sets at different weights are one line each: «80 kg ×8 · 85 kg ×6 · 87,5 kg ×4».</li>
    <li>The gym entries shown were typed into the local chat while testing.</li>
  </ul>
</section>

<section id="rutinas">
  <h2>0 · Rutinas, vídeo y dibujos 3D <span class="tag amber">22-oct</span></h2>
  <p class="lead">Send a training video (one exercise, several, or a whole routine someone gave you). It names each exercise, saves the routine in order, logs what you did, and draws every new exercise once as an animated 3D mannequin.</p>
  <div class="grid">
    <div>
      {fig("37-rutinas", "«Rutinas» in Entrenos: your leg routine in order, each exercise with its drawing; «jue 22 · 3 de 7» = last time, and how much of it")}
    </div>
    <div>
      <h3>What happens with a video</h3>
      <ol class="steps">
        <li><b>Cut for free.</b> ffmpeg takes ~60 frames (one every 0,8 s) and lays them out on 3 contact sheets of 20.</li>
        <li><b>Read once, cheap.</b> One Sonnet call reads the 3 sheets: one line per exercise, with seconds, reps, side and equipment; resting and walking go apart. ~7k tokens in, ~1k out: <b>~$0,04</b>.</li>
        <li><b>The agent gets text</b>, not 60 images (that was ~$0,30 a turn and ran out of room). It also gets the names you already use, so the next video comes back in your words.</li>
        <li><b>It saves</b> the routine (<code>rutina_entreno</code>: each exercise once, in order) and today's session, linked to the routine. A montage's few seconds are a sample, so it does not copy them as your sets.</li>
        <li><b>Part of a routine</b> («hoy solo los tres primeros, 3 series») logs only those, still linked: the card shows «3 de 7».</li>
        <li><b>Each new exercise</b> is looked up on the web once (how, muscles) and drawn once (gpt-image-1.5): a few cents, after the reply, never again.</li>
      </ol>
    </div>
  </div>

  <h3>The conversation, with your video <span class="tag ex">mockup</span></h3>
  <p class="lead" style="margin:0 0 8px">Real texts from the local test with <code>WhatsApp Video 2026-07-21 at 20.32.40.mp4</code> (50 s); the bubbles are drawn here.</p>
  <div class="bub me"><i>Vídeo</i>Esta es la rutina de pierna que me han pasado. Hoy la he hecho entera.</div>
  <div class="bub sys">What the reader handed the agent:
Lo que se ve en el vídeo (50 s), leído de sus fotogramas:
- 0 a 3 s: Sentadilla isométrica en pared (3 s aguantando)
- 3 a 9 s: Zancada estática (split squat) (4 reps)
- 9 a 16 s: Sentadilla isométrica en pared (3 s aguantando)
- 16 a 24 s: Puente de glúteo a una pierna con banda (banda)
- 25 a 29 s: Plancha de oso (3 s aguantando)
- 29 a 33 s: Sentadilla a una pierna con fitball (4 reps, fitball)
- 34 a 50 s: Elevación de rodilla con mancuernas alternando piernas (8 reps, mancuernas)</div>
  <div class="bub it">Guardada tu rutina de pierna y apuntado el entreno entero de hoy. Gimnasio: 1 de 4, quedan 4 días, vas por detrás.</div>
  <div class="bub it">Dos nombres me los he inventado por lo que se ve, corrígeme si no son esos: «puente de glúteo a una pierna con banda» y «sentadilla a una pierna con fitball».</div>
  <div class="bub me">El último no es elevación de rodilla, es zancada estática con mancuernas. Y el primero son dos: sentadilla en pared con las dos piernas y luego a una pierna.</div>
  <div class="bub sys">Done: «Rutina de pierna» rewritten with 7 exercises, today's session replaced. (Its reply text was not kept.)</div>
  <div class="bub me">Hoy solo he hecho los tres primeros de la rutina de pierna, 3 series de cada.</div>
  <div class="bub sys">Done: 3 exercises × 3 series, linked to the routine → the card says «jue 22 · 3 de 7».</div>

  <h3>How well it read your video</h3>
  <table>
    <tr><th>#</th><th>What is in the video (checked frame by frame)</th><th>First read</th><th>Now in the routine</th></tr>
    <tr><td>1</td><td>Wall sit, 0–2,5 s</td><td class="ok">Sentadilla isométrica en pared</td><td>Sentadilla isométrica en pared</td></tr>
    <tr><td>2</td><td>Single-leg wall sit, 7,6–10,9 s</td><td class="ko">Same as 1 (missed the leg in the air)</td><td>Sentadilla isométrica en pared a una pierna <span class="tag">your correction</span></td></tr>
    <tr><td>3</td><td>Split squat, hands on hips, 3,4–7,6 s</td><td class="ok">Zancada estática (split squat)</td><td>Zancada estática</td></tr>
    <tr><td>4</td><td>Single-leg glute bridge with mini band, 11,8–20 s</td><td class="ok">Puente de glúteo a una pierna con banda</td><td>Same</td></tr>
    <tr><td>5</td><td>From bear position, hips up straightening the legs and back down, 21–28,6 s</td><td class="ko">Plancha de oso</td><td>Oso a pica <span class="tag">your correction, 22-oct</span></td></tr>
    <tr><td>6</td><td>Single-leg squat, fitball against the wall, 29–33 s</td><td class="ok">Sentadilla a una pierna con fitball</td><td>Same</td></tr>
    <tr><td>7</td><td>Split squat with dumbbells, 33,6–49,6 s</td><td class="ko">Elevación de rodilla con mancuernas</td><td>Zancada estática con mancuernas <span class="tag">your correction</span></td></tr>
  </table>
  <ul style="margin-top:10px">
    <li><b>4 of 7 right first time, 3 fixed with one message.</b> The reader varies a little run to run; a cheaper model (Haiku, ~1 cent) missed 2 of 6, so it stays on Sonnet.</li>
    <li>Since today the reader knows «oso a pica» (bear position, hips up, legs straightening = a leg exercise, not a plank), and your own names win next time.</li>
  </ul>

  <h3>Every exercise, drawn in 3D</h3>
  <p class="lead" style="margin:0 0 4px">Animated here exactly as in the app: two poses of one drawing, crossfading. Under each, how it's done and the muscles it counts (bold = main), from a web lookup.</p>
  {renders}
  <p class="note">Three of the seven leg drawings came out with two almost identical poses (the bridge, the single-leg wall sit, the bear one) and were redrawn once. The cause was that a <b>hold</b> has no movement, so the lookup described the same pose twice. Fixed: for a hold it now describes how you get into it, then the pose held. All drawings so far: 10, about $0,05 each.</p>

  <h3>On the phone</h3>
  <div class="shots four">{fig("90-movil-entrenos", "Entrenos")}{fig("91-movil-rutinas", "Rutinas, then Sesiones")}</div>
</section>

<section id="gimnasio">
  <h2>0 · En el gimnasio <span class="tag amber">22-oct</span></h2>
  <p class="lead">You train with WhatsApp open and tell it each exercise as you go. «Hoy» fills in while you talk; when the day ends it moves to «Sesiones», grouped by week.</p>
  <div class="grid">
    {fig("38-hoy-sesion", '<span class="tag ex">prueba</span> «Hoy» while you train: 3 of the 7 in your leg routine, each set as a pill, and «Ahora» = the next one')}
    {fig("39-sesiones", '<span class="tag ex">prueba</span> «Sesiones»: one line per day, by week. Tap a day to open it set by set')}
  </div>

  <h3>What to send</h3>
  <table>
    <tr><th>You send</th><th>What it does</th><th>In production</th></tr>
    <tr><td>«Sentadilla en pared, 2 de 45 s»</td><td>Two pills: «45 s» «45 s»</td><td><b>Works now</b></td></tr>
    <tr><td>«Zancada 3x10 con 12 kg», typed or as an audio</td><td>Three pills «12 kg ×10»</td><td><b>Works now</b></td></tr>
    <tr><td>«80 kg ×8, luego 85 ×6»</td><td>One pill per set, each with its weight</td><td><b>Works now</b></td></tr>
    <tr><td>«Me ha costado, la rodilla un poco»</td><td>Kept in that day's note. The card does not show it</td><td><b>Works now</b></td></tr>
    <tr><td>«La última eran 8, no 10»</td><td>Deletes that entry and saves it again</td><td>Works now, <b>not tried yet</b></td></tr>
    <tr><td>A video of an exercise or a whole routine</td><td>Names each exercise and draws the new ones</td><td>After the deploy</td></tr>
    <tr><td>«Guárdalo como rutina de pierna»</td><td>Saves the routine. From then on «Hoy» says «3 de 7» and «Ahora»</td><td>After the deploy</td></tr>
  </table>
  <ul style="margin-top:10px">
    <li>An exercise you already did comes back with the same name and drawing, even with other accents or capitals. It is drawn only once.</li>
    <li>Hours per week come from WHOOP (each workout counted up to 2 h), else from the minutes you said.</li>
    <li>Not on the card: WHOOP strain, the «Actividad» days and your notes.</li>
  </ul>
  <p class="note">Step-by-step mockup of a whole session, chat on the left and «Hoy» on the right: <a href="sesiones.html">sesiones.html</a>.</p>
</section>

<section id="semana">
  <h2>6 · Esta semana</h2>
  <p class="lead">Your commitments, Monday to Sunday. Dark dot = done; amber ring = due today.</p>
  <div class="grid">
    {fig("40-semana", "12 oct al 18 oct: Gimnasio 3 de 4 · Correr o bici 35,7 de 40 km · Pastilla · Leer · Dormir")}
    <div>
      <table>
        <tr><th>Type</th><th>Example</th><th>Counted by</th></tr>
        <tr><td>Weekly count</td><td>Gimnasio 4 días</td><td>WHOOP workouts + what you say</td></tr>
        <tr><td>Weekly distance</td><td>Correr o bici 40 km</td><td>WHOOP distance</td></tr>
        <tr><td>Daily habit, photo</td><td>Pastilla · Leer 20 min</td><td>Your photo or video that day; streak</td></tr>
        <tr><td>Limit</td><td>Dormir hasta la 01:00</td><td>WHOOP bedtime</td></tr>
      </table>
      <ul style="margin-top:12px">
        <li>Create, change or remove by talking: «Quiero leer 20 minutos cada día».</li>
        <li>Something new gets its own icon, drawn once in the same style (~16 s, ~€0.05, after the reply). Until then, the generic one.</li>
      </ul>
    </div>
  </div>
  {grid("four", [("41-semana-gimnasio", "Gimnasio"), ("42-semana-correr", "Correr o bici"), ("43-semana-pastilla", "Pastilla: photo days, streak"), ("44-semana-dormir", "Dormir")])}
</section>

<section id="comida">
  <h2>7 · Comida <span class="tag">new</span></h2>
  <p class="lead">Everything you eat, food by food. Send a photo or say it («una caña y unas bravas»); the agent estimates the grams and nutrients of each food, or reads them off the label.</p>
  <div class="grid">
    {fig("48-comida", '<span class="tag ex">prueba</span> Under «Esta semana»: today in kcal; protein and fibre against your target (1,6 g per kg of your weight, 25 g of fibre); then each meal with its time and your photo, and your supplements. Under it, the average of the week on days with lunch and dinner')}
    {fig("49-comida-detalle", '<span class="tag ex">prueba</span> A meal: the photos you sent, then each food with its grams and what it gives you; at the bottom, its ten totals')}
  </div>
  <ol class="steps" style="margin-top:16px">
    <li>Photo or words, by WhatsApp or the web chat: one meal, every food in it (coffee and alcohol too: 60 mg a solo, 8 g a caña). Several photos at once (the plate and its label) are one meal, and a line right after them («esto es la cena») goes with them. On the web you can also paste or drop them.</li>
    <li>The reply ends with how far into the day you are: «Hoy: 1.640 kcal, 98 g de proteína de 120». Short at dinner, it names a food that closes the gap («un yogur griego y una pera»).</li>
    <li>«Lo de siempre», «lo mismo que ayer», «otro igual»: it copies that meal food by food, without asking.</li>
    <li>40 min before bed, if no dinner was logged, the bedtime message asks what you had.</li>
    <li>Wrong? «El arroz eran 100 g»: it deletes the meal and logs it again.</li>
  </ol>
  <details><summary>What it feeds into «Lo que te hace bien y mal»</summary>
    <table>
      <tr><th>Comparison</th><th>When it starts</th></tr>
      <tr><td>Mucha proteína · hidratos · azúcar · fibra · grasa · sal · días de comer mucho: your high third against your low one</td><td>After 30 days with lunch and dinner logged. Until then they are listed as «Aún sin datos suficientes»</td></tr>
      <tr><td>Cenar a menos de 2 h de acostarte (against 3 h or more)</td><td>10 nights each side with a logged dinner</td></tr>
      <tr><td>Café después de las 14:00 · Beber más de dos copas</td><td>10 nights each side</td></tr>
      <tr><td>Supplements: days you take it against days you don't</td><td>From the first day you take it, 10 days each side</td></tr>
    </table>
    <p>Days only count when lunch and dinner are both logged: a half-logged day would look like a day of eating little. Days in a row also count for less: a supplement taken every day since July is not 90 separate tries.</p>
  </details>
</section>

<section id="productos">
  <h2>7 · Piel <span class="tag">new</span></h2>
  <p class="lead">Only your creams: what goes on your skin. Send a photo of one; it lands here with its own 3D icon and its sheet from the web. Supplements live in «Comida», with what you eat and drink.</p>
  {fig("51-productos", '<span class="tag ex">prueba</span> Left column, under «Entrenos»: icon, name, and when to use it, or «Hoy ✓» once used today. «Foto» opens WhatsApp with «Mira esta crema»', ' style="max-width:520px"')}
  <div class="grid" style="margin-top:16px">
    {fig("52-producto-piel", '<span class="tag ex">prueba</span> A cream: brand, active, when; «Lo he usado hoy» with its 14 days; what each ingredient does, «Ojo con», «Cómo»')}
    {fig("53-producto-suplemento", '<span class="tag ex">prueba</span> A supplement, opened from «Comida»: the same sheet, with how often you have really taken it')}
  </div>
  <ol class="steps" style="margin-top:16px">
    <li>Photo to the chat (or WhatsApp): it reads the label, saves it and draws its icon from your photo.</li>
    <li>It looks up the product on the web: what it is, what each active does, warnings, how to use it, sources.</li>
    <li>«Me he tomado la creatina» ticks today; «ya no uso el retinol» retires it (kept, never deleted).</li>
  </ol>
  <p style="margin-top:10px">The two creams here and the three supplements in «Comida» are tests from the other session; it deletes them once you've seen them.</p>
  <details><summary>The evidence it shows for creams (checked 17-oct-2026)</summary>
    <table>
      <tr><th>For</th><th>Line</th><th>Source</th></tr>
      <tr><td>Solar</td><td>Solar every day: skin ages less over 4.5 years (903 adults)</td><td><a href="https://doi.org/10.7326/0003-4819-158-11-201306040-00002">Hughes, Ann Intern Med 2013</a></td></tr>
      <tr><td>Solar</td><td>Reapply every 2 h outdoors, and after sweating or swimming</td><td><a href="https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen">American Academy of Dermatology</a></td></tr>
      <tr><td>Retinol</td><td>At night, 3 days a week to start: it irritates</td><td><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC2699641/">Mukherjee, Clin Interv Aging 2006</a></td></tr>
      <tr><td>Every cream</td><td>Poor sleep: the skin barrier recovers 30 % worse (association)</td><td><a href="https://doi.org/10.1111/ced.12455">Oyetakin-White, Clin Exp Dermatol 2015</a></td></tr>
    </table>
  </details>
</section>

<section id="bano">
  <h2>8 · Baño <span class="tag">new</span></h2>
  <p class="lead">Each time you go to the toilet and how it went, told by WhatsApp in your own words. With the urine infection in March and the prostatitis until April, it is the one place where a symptom coming back shows up.</p>
  {fig("59-lo-que-apuntas", '<span class="tag ex">prueba</span> No card on the panel («no lo hagas visual»): «Datos → Lo que apuntas» counts them under «Baño», and each time is a line in «Día a día → Médico»', ' style="max-width:620px"')}
  <ol class="steps" style="margin-top:16px">
    <li>«Acabo de mear y me escuece un poco» → <i>Pis: escozor</i>. «He cagado, normal» → <i>Caca: tipo 4</i> (the Bristol scale: 1 hard lumps, 4 normal, 7 liquid). «Esta noche me he levantado dos veces a mear» → two pees at 03:00. «He tardado 10 minutos» is kept too.</li>
    <li>What it keeps: pee or poo, how it went (bien, regular, mal) and only the symptoms you say: escozor, urgencia, dolor, sangre, no vacía del todo, chorro flojo.</li>
    <li>The reply is one line with the day so far: «Apuntado. Hoy 3 pis y 1 caca».</li>
    <li>Blood, burning or pain with fever, or burning two days running: a second line telling you to call your doctor.</li>
  </ol>
</section>

<section id="bienmal">
  <h2>8 · Lo que te hace bien y mal <span class="tag">new</span></h2>
  <p class="lead">From your own 243 nights of WHOOP: what goes with better and worse days. Not general advice: yours.</p>
  {fig("55-hallazgos", "On the panel: «Te hace bien» left, «Te hace mal» right")}
  <div class="grid" style="margin-top:16px">
    {fig("58-efectos-entero", "«Ver todo» → Cómo te afecta: one tab per result (Recuperación, Ánimo, Sueño, VFC, Pulso, Síntomas, Código). Te hace bien · Por aclarar · Te hace mal; «probable» when it is less sure")}
    {fig("56-hallazgo", "Click a row: the numbers behind it, and «Probarlo dos semanas»")}
  </div>
  <ul style="margin-top:12px">
    <li>«Probarlo dos semanas» starts a test of that habit; it shows under «Probando» on this page until it ends. None started yet, so no screenshot.</li>
    <li>«Aún sin datos suficientes» lists what still has too few nights to say (today: tension with your partner, drinking, coffee…).</li>
    <li><b>New: Ánimo and Síntomas</b>, the next day's. The bedtime message ends with «¿qué tal el día, del 1 al 10? ¿algún síntoma?» until you answer; «un 7, nada» or «un 5, y algo de tos» is enough. With about 10 days on each side (a few weeks) the first results show; until then both tabs say so.</li>
  </ul>
  <details><summary>What it compares: 48 habits × 7 results = 336 comparisons</summary>
    <p>Each habit against each result (Recuperación, Ánimo, Sueño, VFC, Pulso, Síntomas, Código). On the local copy, 101 have enough days on both sides and 23 are clear (16 good, 7 bad). Production has more days, so more of them.</p>
    <table>
      <tr><th>Group</th><th>Habits</th></tr>
      <tr><td>Sleep</td><td>Bed early, short sleep, sleep debt, weekend, Sunday</td></tr>
      <tr><td>Training</td><td>Any, strength, cardio, late workout, a hard day. <b>New:</b> a gym session or run told in the chat counts, even when WHOOP missed it</td></tr>
      <tr><td>Work</td><td>Coding late, no code, a heavy coding day, a day full of meetings</td></tr>
      <tr><td>Phone</td><td>WhatsApp late, phone right before bed, many messages, a tense day, and for 8 topics (clients, partner, family…) talking about it and tension about it</td></tr>
      <tr><td>Life</td><td>Seeing people</td></tr>
      <tr><td>Food and drink</td><td>Alcohol, more than two drinks, caffeine, caffeine after 14:00, dinner close to bed, and 7 nutrients (your high third against your low one)</td></tr>
      <tr><td>Supplements</td><td>One per supplement: days you take it against days you don't</td></tr>
      <tr><td><b>New:</b> your habits and your own things</td><td>One per habit you tick («Leer 20 min», «Pastilla») and per thing you log («Meditar», «Sauna»), from the first day</td></tr>
      <tr><td><b>New:</b> your symptoms</td><td>One per symptom («Dolor de cabeza», «Pis con escozor»): days with it against days you said you were fine. It shows what comes with it (a worse night), never a habit to try</td></tr>
    </table>
  </details>
</section>

<section id="datos">
  <h2>9 · Datos</h2>
  <p class="lead">Every number, one click away and off the panel: «Datos», top right. Three tabs.</p>
  <h3>Evolución: 12 weeks of each card</h3>
  {grid("two", [("60-datos", "Sueño, Recuperación, Entreno, Peso, Código, Llamadas. Amber arrow = worse than your average"), ("61-datos-abajo", "Further down")])}
  <p style="margin-top:10px">Peso stays empty until you send a photo of the scale to the chat. These shots are from the local copy, whose WHOOP stops on 6 Sept («hasta el 7 sept», and «Sueño» empty this week); production syncs every 10 min.</p>
  <h3>Día a día: every day, with 8 filters</h3>
  {grid("four", [("62-dia-todo", "<b>Todo</b>"), ("63-dia-sueno", "<b>Sueño</b>: WHOOP (empty here: local copy)"), ("64-dia-entreno", "<b>Entreno</b>: WHOOP + chat"), ("65-dia-comidas", "<b>Comidas</b>: chat and photos"), ("66-dia-trabajo", "<b>Trabajo</b>: calls and code"), ("67-dia-vida", "<b>Vida</b>: Pocket outside work"), ("68-dia-whatsapp", "<b>WhatsApp</b>: pattern + one line per chat"), ("69-dia-medico", "<b>Médico</b>: the history")])}
  <h3>Lo que apuntas: everything you log, by category <span class="tag">new</span></h3>
  <div class="grid">
    {fig("59-lo-que-apuntas", '<span class="tag ex">prueba</span> The last 30 days, one card per category: Ánimo and Síntomas always first, then the most used. Each thing with how often, the last day and its last figure')}
    <ol class="steps">
      <li>Tell the chat anything: «me duele la cabeza, un 6, en la sien» → <i>Síntomas · Dolor de cabeza · 6/10</i>. «Dos litros de agua» → <i>Hidratación · Agua · 2 L</i>.</li>
      <li>New things land in one of your categories, or in a new short one. Next time it uses the same name and category.</li>
      <li>You sort it by talking: «pon la sauna en Descanso», «junta migraña con dolor de cabeza», «cambia Descanso por Recuperación». Past entries move with it; nothing is deleted. Ánimo and Síntomas keep their names: they are what gets compared.</li>
      <li>Things you do (sauna, agua) are compared in «Lo que te hace bien y mal» as habits. Your mood and your symptoms are compared as results: what you did the day before against how you felt.</li>
    </ol>
  </div>
  <h3>WhatsApp: what topics tense you <span class="tag">new</span></h3>
  <div class="grid">
    {fig("68-whatsapp-temas", "«Qué temas te tensan · 12 semanas»: share of tense chats per topic")}
    <div>
      <ul>
        <li>Each chat of the day gets a topic: Clientes, Socio, Equipo, Familia, Pareja, Amigos, Dinero, Salud or Otros.</li>
        <li>By what was talked about; if unclear, by who it was.</li>
        <li>Bars are the % of that topic's chats read as tense or bad. «Otros» and topics with too few chats stay out.</li>
        <li>The agent's «buscar» sees the same: «¿qué me tensa más?».</li>
      </ul>
    </div>
  </div>
</section>

<section id="movil">
  <h2>10 · Móvil</h2>
  <p class="lead">Same app on the phone. The camera opens directly; «Llamar» dials; the SMS code fills itself in.</p>
  {grid("four", [("90-movil-entrenos", "Entrenos"), ("91-movil-rutinas", "Rutinas"), ("80-movil-login", "Login"), ("89-movil-recuperar", "Recuperar contraseña"), ("81-movil-chat", "Chat"), ("82-movil-panel", "Panel"), ("83-movil-urgente", "An urgent item"), ("84-movil-hoy", "Hoy"), ("85-movil-semana", "Esta semana"), ("86-movil-productos", "Piel"), ("87-movil-datos", "Datos")])}
  <h3>The whole panel on the phone</h3>
  <div class="tall" style="width:360px">{fig("88-movil-panel-entero", "")}</div>
</section>

{wa}

{solo}

<section id="estado">
  <h2>13 · Status</h2>
  <table>
    <tr><th>Item</th><th>Status</th></tr>
    <tr><td>Rutinas, vídeo, 3D <span class="tag amber">22-oct</span></td><td><b>Only on your laptop.</b> Goes live with the next deploy, which also creates the <code>training_routines</code> table. Checked 22-oct: production has no routine and no training since 15-oct; the video was never sent to it.</td></tr>
    <tr><td>«Hoy» and «Sesiones» <span class="tag amber">22-oct</span></td><td><b>Only on your laptop</b>, tried on the test copy (<code>pnpm test</code> passes). Production already has your 21-oct leg session (entry 167). It is linked to a routine once the deploy is out and you save the routine.</td></tr>
    <tr><td>The 10 drawings</td><td>Live only in the local copy. In production each exercise is drawn the first time you log or save it (~$0,05 each).</td></tr>
    <tr><td>Everything else in this guide</td><td><b>Live</b> on <code>health-five-livid.vercel.app</code> since 18-oct (deploy <code>dpl_HdQT9…</code>): <code>/login</code> answers 200, a photo without a session 401.</td></tr>
    <tr><td>Git</td><td><b>Not committed.</b> It was deployed from the working tree: a deploy from git would put the old version back.</td></tr>
    <tr><td>SMS for «¿Olvidaste tu contraseña?»</td><td>Local test 12/12 (code to the console). In production it needs Vesta's 4 <code>TWILIO_*</code> keys in Vercel: <b>still not in Vercel</b> (checked 18-oct). Without them the code never arrives; <code>cambiar-contrasena.sh</code> still works.</td></tr>
    <tr><td>Migrations</td><td>All 20 ran on production with the deploy, <code>photos</code> and the products clean-up included.</td></tr>
    <tr><td>18 medical entries</td><td>On the local DB. Not checked in production: if «Historial médico» is empty there, <code>scripts/import-historial.ts --write</code>.</td></tr>
    <tr><td>Your WhatsApp, 97 days with topics</td><td>Read on the local DB (~$3.12). Production reads it once a day by itself.</td></tr>
    <tr><td>Photos by WhatsApp</td><td>Live, <b>not tried yet from your phone</b>. Two photos at once of your next meal should get one reply and show on «Comida».</td></tr>
    <tr><td>Lo que apuntas, Ánimo y Síntomas</td><td><b>Only on your laptop.</b> Categories, <code>organizar</code>, the «Datos» tab, the two new tabs and the bedtime question are not deployed yet.</td></tr>
    <tr><td>Baño</td><td><b>Only on your laptop.</b> Not deployed yet: the agent in production does not know «Baño».</td></tr>
    <tr><td>Piel</td><td>A food or drink saved as a product (a yogurt, a Monster) was retired with the deploy; the days you took it still count.</td></tr>
    <tr><td>Tests</td><td><code>pnpm test</code>: all pass (22-oct). Typecheck and lint <b>not run</b> since 18-oct.</td></tr>
    <tr><td>Google</td><td>No keys: the button stays hidden</td></tr>
  </table>
</section>

</main>
</body>
</html>
'''
imgs = re.findall(r'shots/([\w-]+)\.png', body + entrar)
navhtml = '<nav>\n  <h1>Salud</h1>\n  <p>Guía completa · 22 oct 2026 · ' + str(len(set(imgs))) + ' capturas</p>\n' + ''.join(f'  <a href="#{i}"><span>{n}</span>{t}</a>\n' for n, (i, t) in enumerate(nav)) + '</nav>'
out = head + '\n</head>\n<body>\n' + navhtml + body
# Section numbers follow the nav, so adding a section renumbers the rest.
order = {k: n for n, (k, _) in enumerate(nav)}
out = re.sub(r'(<section id="(\w+)">\s*<h2>)\d+ · ', lambda m: m.group(1) + f'{order[m.group(2)]} · ', out)
open(OUT + 'index.html', 'w').write(out)
imgs = set(re.findall(r'shots/([\w-]+)\.png', out))
have = {f[:-4] for f in os.listdir(OUT + 'shots') if f.endswith('.png')}
print(len(imgs), 'images referenced; missing:', sorted(imgs - have))
print('unused on disk:', sorted(have - imgs))
