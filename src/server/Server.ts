import { WebSocketServer, WebSocket, ServerOptions as WsServerOptions } from 'ws'
import { encode as encodeMsgPack, decode as decodeMsgPack } from 'msgpack-lite'
import { logToStderr } from '../utilities/Utilities.js'
import { OpenPromise } from '../utilities/OpenPromise.js'
import { readFile, existsSync } from '../utilities/FileSystem.js'
import { extendDeep } from '../utilities/ObjectUtilities.js'
import { sendMessageToWorker, addListenerToWorkerMessages, startNewWorkerThread } from './Worker.js'
import { Worker } from 'node:worker_threads'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Logger } from '../utilities/Logger.js'
import chalk from 'chalk'

const log = logToStderr

export async function startServer(serverOptions: ServerOptions, onStarted: (options: ServerOptions) => void) {
	serverOptions = extendDeep(defaultServerOptions, serverOptions)

	const wsServerOptions: WsServerOptions = {
		perMessageDeflate: serverOptions.deflate,
		maxPayload: serverOptions.maxPayload
	}

	function onHttpRequest(request: IncomingMessage, response: ServerResponse) {
		response.writeHead(200, { 'Content-Type': 'text/plain' })
		response.end("This is the Echogarden HTTP server!")
	}

	if (serverOptions.secure) {
		if (!serverOptions.certPath || !existsSync(serverOptions.certPath)) {
			throw new Error(`No valid certificate file path was given`)
		}

		if (!serverOptions.keyPath || !existsSync(serverOptions.keyPath)) {
			throw new Error(`No valid key file path was given`)
		}

		const { createServer } = await import('https')

		const httpsServer = createServer({
			cert: await readFile(serverOptions.certPath!),
			key: await readFile(serverOptions.keyPath!)
		}, onHttpRequest)

		httpsServer.listen(serverOptions.port!)

		wsServerOptions.server = httpsServer
	} else {
		const { createServer } = await import('http')

		const httpServer = createServer({}, onHttpRequest)

		httpServer.listen(serverOptions.port)

		wsServerOptions.server = httpServer
	}

	const wss = new WebSocketServer(wsServerOptions)

	const requestIdToWebSocket = new Map<string, WebSocket>()

	function onWorkerMessage(message: any) {
		if (message.name == "writeToStdErr") {
			return
		}

		// Remove input raw audio property from message, if exists, when using WebSocket protocol:
		message['inputRawAudio'] = undefined

		if (!message.requestId) {
			throw new Error("Worker message doesn't have a request ID")
		}

		const ws = requestIdToWebSocket.get(message.requestId)

		if (!ws || ws.readyState != WebSocket.OPEN) {
			return
		}

		const encodedWorkerMessage = encodeMsgPack(message)

		ws.send(encodedWorkerMessage)
	}

	let workerThread: Worker | undefined

	if (serverOptions.useWorkerThread) {
		workerThread = await startNewWorkerThread()
		workerThread.on('message', onWorkerMessage)
	} else {
		addListenerToWorkerMessages(onWorkerMessage)
	}

	const serverOpenPromise = new OpenPromise()

	wss.on("listening", () => {
		log(chalk.gray(`Started Echogarden WebSocket server on port ${serverOptions.port}`))
		onStarted(serverOptions)
	})

	wss.on("close", () => {
		serverOpenPromise.resolve()
	})

	wss.on('connection', async (ws, req) => {
		log(chalk.gray((`Accepted incoming connection from ${req.socket.remoteAddress}`)))

		ws.on('message', (messageData, isBinary) => {
			if (!isBinary) {
				log(chalk.gray((`Received an unexpected string WebSocket message: '${(messageData as Buffer).toString("utf-8")}'`)))
				return
			}

			let incomingMessage: any

			try {
				incomingMessage = decodeMsgPack(messageData as Buffer)
			} catch (e) {
				log(chalk.gray(`Failed to decode binary WebSocket message. Reason: ${e}`))
				return
			}

			const requestId = incomingMessage.requestId

			if (!requestId) {
				log(chalk.gray(("Received a WebSocket message without a request ID")))
				return
			}

			requestIdToWebSocket.set(requestId, ws)

			if (workerThread) {
				workerThread.postMessage(incomingMessage)
			} else {
				sendMessageToWorker(incomingMessage)
			}
		})

		ws.on('error', (e) => {
			log(`${chalk.redBright('WebSocket error')}: ${e.message}`)
		})

		ws.on("close", () => {
			const keysToDelete: string[] = []

			requestIdToWebSocket.forEach((value, key) => {
				if (value == ws) {
					keysToDelete.push(key)
				}
			})

			keysToDelete.forEach(key => requestIdToWebSocket.delete(key))

			log(chalk.gray((`Incoming connection from ${ req.socket.remoteAddress } was closed`)))
		})
	})

	return serverOpenPromise.promise
}

export interface ServerOptions {
	port?: number
	secure?: boolean
	certPath?: string
	keyPath?: string
	deflate?: boolean
	maxPayload?: number
	useWorkerThread?: boolean
}

export const defaultServerOptions: ServerOptions = {
	port: 45054,
	secure: false,
	certPath: undefined,
	keyPath: undefined,
	deflate: true,
	maxPayload: 1000 * 1000000, // 1GB
	useWorkerThread: true
}
