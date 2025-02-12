import * as THREE from './three.module.js'
import { GLTFLoader } from './gltfLoader.module.js'
import { DRACOLoader } from './dracoLoader.module.js'

if (location.protocol.startsWith('https')) {
	navigator.serviceWorker.register('service-worker.js')
	navigator.serviceWorker.onmessage = m => {
		console.info('Update found!')
		if (m?.data == 'update') location.reload(true)
	}
}

const recognition = new webkitSpeechRecognition()
recognition.lang = 'pt-BR'
recognition.continuous = true
const synth = new SpeechSynthesisUtterance()
const clock = new THREE.Clock()
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
const hemisphereLight = new THREE.HemisphereLight(0xFFFFFF, 0xFFFFFF, 1)
const dirLight1 = new THREE.DirectionalLight(0xFFFFFF, 1)
const dirLight2 = new THREE.DirectionalLight(0xFFFFFF, 1)
const dirLight3 = new THREE.DirectionalLight(0xFFFFFF, 1)
const gltfLoader = new GLTFLoader()
const dracoLoader = new DRACOLoader()
const scene = new THREE.Scene()
const fpsLimit = 1 / 60

var stone
var clockDelta = 0
var gameStarted = false
var hasGreeting = false
var isTalking = false
var loading = false
var lock = false
var increase = false
var speakSize = 1
var elapsedTime = 0
var isListening  = false
var rotation = {
	direction: 1,
	orientation: 'x',
	speed: 0.05,
	cycle: 0
}

gltfLoader.setDRACOLoader(dracoLoader)
scene.background = null
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.sortObjects = false
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.setClearColor(0x000000, 0)
scene.add(hemisphereLight)
dirLight1.position.set(0, 0, 0)
dirLight2.position.set(20, 0, 20)
dirLight3.position.set(-20, 0, 20)
scene.add(dirLight1)
scene.add(dirLight2)
scene.add(dirLight3)

function loadModel() {
	gltfLoader.load('./models/stone.glb',
		gltf => {
			stone = gltf.scene
			stone.colorSpace = THREE.SRGBColorSpace
			dirLight1.target = stone
			dirLight2.target = stone
			dirLight3.target = stone
			scene.add(stone)
			scene.layers.enable(1)
		}, xhr => {
			if (xhr.loaded >= (xhr.total || 0)) initGame()
		}, error => {
			console.error(error)
		}
	)
}

function initGame() {
	if (gameStarted) return
	gameStarted = true
	document.body.classList.add('loaded')
	document.body.removeChild(document.querySelector('figure'))
	document.querySelector('footer').style.removeProperty('display')
	resizeScene()
	animate()
}

function resizeScene() {
	camera.aspect = window.visualViewport.width / window.visualViewport.height
	camera.updateProjectionMatrix()
	renderer.setPixelRatio(window.devicePixelRatio)
	renderer.setSize(window.visualViewport.width, window.visualViewport.height)
	camera.position.z = 5
}

function animate() {
	requestAnimationFrame(animate)
	if (document.hidden) return
	clockDelta += clock.getDelta()
	if (fpsLimit && clockDelta < fpsLimit) return
	renderer.render(scene, camera)
	clockDelta = fpsLimit ? clockDelta % fpsLimit : clockDelta
	updateMovement()
}

function updateMovement() {
	if (!stone) return
	if (!lock && (performance.now() - elapsedTime) > 500) {
		elapsedTime = performance.now()
		increase = false
		lock = true
	}
	if (isTalking) {
		stone.rotation.set(0, 0, 0)
		if (!increase && stone.scale.x > 1) scaleStone()
		else if (increase && stone.scale.x < speakSize) scaleStone(true)
		if (increase && stone.scale.x >= speakSize || !increase && stone.scale.x <= 1) lock = false
	} else if (stone.scale.x != 1) {
		if (stone.scale.x > 1) scaleStone()
		else scaleStone(true)
	} else {
		if (rotation.cycle >= Math.PI) {
			rotation.orientation = Math.random() >=  0.5 ? 'y' : 'x'
			rotation.direction = Math.random() >= 0.5 ? 1 : 0
			rotation.cycle = 0
		}
		let speed = rotation.speed
		if (rotation.direction != 1) speed *= -1
		if (rotation.orientation == 'y') {
			stone.rotation.x = 0
			stone.rotation.y += speed
		} else {
			stone.rotation.x += speed
			stone.rotation.y = 0
		}
		rotation.cycle += rotation.speed
	}
	if (!lock && isChrome()) {
		setTimeout(() => {
			increase = !increase
			if (increase) speakSize = 1 + (Math.random() * 0.15)
			lock = true
		}, rand(500, 1500))
	}
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function scaleStone(grow) {
	if (grow) {
		stone.scale.x += 0.01
		stone.scale.y += 0.01
		stone.scale.z += 0.01
	} else {
		stone.scale.x -= 0.01
		stone.scale.y -= 0.01
		stone.scale.z -= 0.01
	}
}

function speak(text) {
	if (!text) return
	if (!synth.voice) {
		var voice
		['antonio', 'daniel', 'reed', 'brasil', 'francisca'].some(el => {
			voice = speechSynthesis.getVoices().find(_ => _.name.toLocaleLowerCase().includes(el.toLocaleLowerCase()) && _.lang.substring(0, 2).toLocaleLowerCase() == 'pt')
			if (voice) return true
		})
		if (!voice) return setTimeout(() => speak(text), 100)
		synth.voice = voice
	}
	speechSynthesis.cancel()
	synth.lang = synth.voice?.lang || 'pt-BR'
	synth.text = text.trim()
	if (synth.voice?.name.toLocaleLowerCase().includes('daniel')) synth.rate = 1.5
	isTalking = true
	speechSynthesis.speak(synth)
}

function talk(text) {
	if (!text || loading) return
	loading = true
	const url = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:5001/stop-dbb76/us-central1/api/chatgpt' : 'https://us-central1-stop-dbb76.cloudfunctions.net/api/chatgpt'
	fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ text: text.trim() })
	})
	.then(response => {
		return response.json()
	})
	.then(json => {
		speak(json.choices[0].message.content)
	})
	.catch(e => {
		isTalking = false
		speechSynthesis.cancel()
		speak(`Desculpe, minha licença do chat GPT expirou.`)
		console.error(e)
	})
	.finally(() => {
		document.querySelector('input').disabled = false
		document.querySelector('input').value = null
		document.querySelector('input').focus()
		loading = false
	})
}

function greetings() {
	if (!gameStarted || hasGreeting) return
	//speak('Olá, eu sou a pedra falante. Para conversar comigo, digite no campo abaixo, ou fale pelo microfone.')
	hasGreeting = true
}

function isChrome() {
	return navigator.userAgentData?.brands.some(el => /chrome/i.test(el.brand)) ?? false
}

function startListen() {
	if (isListening) return
	try { navigator.vibrate(100) } catch(e) {}
	recognition.abort()
	speechSynthesis.cancel()
	document.querySelector('#mic').classList.add('listening')
	document.querySelector('input').value = ''
	recognition.start()
	isListening = true
}

function stopListen() {
	if (!isListening) return
	try { navigator.vibrate(100) } catch(e) {}
	document.querySelector('#mic').classList.remove('listening')
	recognition.abort()
	isListening = false
}

function toggleListener(e) {
	e.stopPropagation()
	if (isListening) stopListen()
	else startListen()
}

if (!isChrome()) {
	synth.onboundary = () => {
		increase = !increase
		if (increase) speakSize = 1 + (Math.random() * 0.15)
		lock = true
	}
}

synth.onend = () => {
	isTalking = false
}
synth.onpause = () => {
	isTalking = false
}
synth.onerror = () => {
	isTalking = false
	speechSynthesis.cancel()
}

recognition.onresult = e => {
	let result = ''
	for (let i in e.results) {
		for (let j in e.results[i]) {
			result += e.results[i][j].transcript ?? ''
		}
	}
	document.querySelector('input').value = result
}

recognition.onspeechend = () => {
	stopListen()
}

window.onresize = () => resizeScene()
window.visualViewport.onresize = () => resizeScene()
window.visualViewport.onscroll = () => resizeScene()

document.onreadystatechange = () => {
	if (document.readyState != 'complete') return
	loadModel()
	document.querySelector('#speak').onclick = () => {
		if (loading) return
		talk(document.querySelector('input').value)
		document.querySelector('input').disabled = true
	}
	document.querySelector('input').onkeydown = e => {
		if (e.code != 'Enter' || loading) return
		talk(document.querySelector('input').value)
		document.querySelector('input').disabled = true
	}
	/* document.querySelector('#mic').onmousedown = () => startListen()
	document.querySelector('#mic').ontouchstart = () => startListen()
	document.querySelector('#mic').onmouseup = () => stopListen()
	document.querySelector('#mic').ontouchend = () => stopListen() */
	document.querySelector('#mic').onclick = e => toggleListener(e)
}
document.onvisibilitychange = () => {
	if (!document.hidden) return
	isTalking = false
	speechSynthesis.cancel()
	document.querySelector('input').value = null
	document.querySelector('input').disabled = false
}
document.onclick = () => greetings()
document.ontouchend = () => greetings()

document.body.appendChild(renderer.domElement)
//document.body.oncontextmenu = () => { return false }