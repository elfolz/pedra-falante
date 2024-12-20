import * as THREE from './three.module.js'
import { GLTFLoader } from './gltfLoader.module.js'
import { DRACOLoader } from './dracoLoader.module.js'
import { OrbitControls } from './orbitControls.js'

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
gltfLoader.setDRACOLoader(dracoLoader)
const scene = new THREE.Scene()
const controls = new OrbitControls(camera, renderer.domElement)
const fpsLimit = 1 / 60

var clockDelta = 0
var gameStarted = false
var hasGreeting = false
var isTalking = false
var stone
var audioContext
var destination
var voiceGain
var stoneGain
var voiceSrc
var stoneSrc
var stoneBuffer
var loading = true

scene.background = null
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.sortObjects = false
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.setClearColor(0x000000, 0)
scene.add(hemisphereLight)
controls.screenSpacePanning = true
controls.enableZoom = false
dirLight1.position.set(0, 0, 0)
dirLight2.position.set(10, 10, 10)
dirLight3.position.set(-10, 10, 10)
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
			scene.layers.enable( 1 )
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
	controls.update()
	clockDelta = fpsLimit ? clockDelta % fpsLimit : clockDelta
	updateMovement()
}

function updateMovement() {
	if (!stone) return
	if (loading) {
		if (hasGreeting && (stone.rotation.y % 1) >= 0.5) {
			stone.rotation.y = 0
			loading = false
		}
		stone.rotation.y += 0.05
	}
	if (isTalking) {
		if (performance.now() % 0.5 > 0 ) return
		const scale = 1 + (Math.random() / 10)
		stone.scale.set(scale, scale, scale)
	} else {
		if (stone.scale.x > 1) {
			stone.scale.set(stone.scale.x - 0.05,stone.scale.y - 0.05, stone.scale.z- 0.05)
		}
	}
}

function speak(text) {
	if (!text) return
	if (/edg/i.test(navigator.userAgent)) return localVoice(text)
	naturalVoice(text)
}

function naturalVoice(text) {
	fetch(`https://us-central1-stop-dbb76.cloudfunctions.net/api/naturalvoice`, {
		method: 'POST',
		body: text.trim()
	})
		.then(response => {
			return response.arrayBuffer()
		})
		.then(buffer => {
			if (document.hidden) return
			return audioContext.decodeAudioData(buffer)
				.then(audioData => {
					isTalking = true
					playstoneAudio()
					animateTalk()
					if (voiceSrc) voiceSrc.disconnect()
					voiceSrc = audioContext.createBufferSource()
					voiceSrc.buffer = audioData
					voiceSrc.connect(voiceGain)
					voiceSrc.start(0)
					voiceSrc.onended = () => {
						isTalking = false
						voiceSrc.disconnect()
						stoneSrc?.disconnect()
						stoneSrc = undefined
					}
				})
		})
		.catch(error => {
			localVoice(text)
		})
}

function localVoice(text) {
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
	synth.lang = synth.voice?.lang ?? 'pt-BR'
	synth.text = text.trim()
	if (synth.voice?.name.toLocaleLowerCase().includes('daniel')) {
		synth.pitch = 1.5
		synth.rate = 1.5
	}
	isTalking = true
	speechSynthesis.speak(synth)
}

function talk(text) {
	if (!text || loading) return
	loading = true
	playstoneAudio()
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
			voiceSrc?.disconnect()
			stoneSrc?.disconnect()
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

function initAudio() {
	audioContext = new AudioContext()
	voiceGain = audioContext.createGain()
	stoneGain = audioContext.createGain()
	stoneGain.gain.value = 0.25
	destination = audioContext.createMediaStreamDestination()
	voiceGain.connect(audioContext.destination)
	stoneGain.connect(audioContext.destination)
	document.querySelector('audio').srcObject = destination.stream
	document.querySelector('audio').play()
}

function playstoneAudio() {
	if (!audioContext || !stoneBuffer) return
	if (stoneSrc) stoneSrc.disconnect()
	stoneSrc = audioContext.createBufferSource()
	stoneSrc.buffer = stoneBuffer
	stoneSrc.loop = true
	stoneSrc.connect(stoneGain)
	stoneSrc.start(0)
	stoneSrc.onended = () => {
		stoneSrc?.disconnect()
		stoneSrc = undefined
	}
}

synth.onend = () => {
	isTalking = false
	stoneSrc?.disconnect()
}
synth.onpause = () => {
	isTalking = false
	stoneSrc?.disconnect()
}
synth.onerror = () => {
	isTalking = false
	speechSynthesis.cancel()
	stoneSrc?.disconnect()
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
		if (e.keyCode != 13 || loading) return
		talk(document.querySelector('input').value)
		document.querySelector('input').disabled = true
	}
}
document.onvisibilitychange = () => {
	if (!document.hidden) return
	isTalking = false
	voiceSrc?.disconnect()
	stoneSrc?.disconnect()
	speechSynthesis.cancel()
	document.querySelector('input').value = null
	document.querySelector('input').disabled = false
}
document.onclick = () => {
	if (!gameStarted || hasGreeting) return
	initAudio()
	speak('Olá, eu sou o GP Treider. Para falar comigo, digite no campo abaixo.')
	hasGreeting = true
}
document.body.appendChild(renderer.domElement)