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
var loading = true
var lock = false
var increase = false
var speakSize = 1
var elapsedTime = 0

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
			if (xhr.loaded >= xhr.total) initGame()
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
		stone.rotation.y = 0
		if (!increase && stone.scale.x > 1) scaleStone()
		else if (increase && stone.scale.x < speakSize) scaleStone(true)
		if (increase && stone.scale.x >= speakSize || !increase && stone.scale.x <= 1) lock = false
	} else if (stone.scale.x != 1) {
		if (stone.scale.x > 1) scaleStone()
		else scaleStone(true)
	} else {
		stone.rotation.y += 0.01
	}
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
		['antonio', 'daniel', 'reed', 'brasil'].some(el => {
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
			speak(`Desculpe, minha licença do chatGPT expirou.`)
			console.log(e)
		})
		.finally(() => {
			document.querySelector('input').disabled = false
			document.querySelector('input').value = null
			document.querySelector('input').focus()
			loading = false
		})
}

synth.onboundary = () => {
	increase = !increase
	if (increase) speakSize = 1 + (Math.random() * 0.15)
	lock = true
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
}
document.onvisibilitychange = () => {
	if (!document.hidden) return
	isTalking = false
	speechSynthesis.cancel()
	document.querySelector('input').value = null
	document.querySelector('input').disabled = false
}
document.onclick = () => {
	//if (!gameStarted || hasGreeting) return
	speak('Olá, eu sou o GP Treider. Para falar comigo, digite no campo abaixo.')
	hasGreeting = true
}
document.body.appendChild(renderer.domElement)