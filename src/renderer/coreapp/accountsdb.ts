import sqlite3 from 'better-sqlite3'
import electron from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { ensureLeading0x, toChecksumAddress } from '@celo/utils/lib/address'
import { isValidAddress } from 'ethereumjs-util'

import { Account, AddressOnlyAccount, LedgerAccount, LocalAccount } from '../state/accounts'
import { CFG } from '../../common/cfg'

// Supported `account` row versions. Last version is the current version.
const supportedVersions = [1]
const currentVersion = supportedVersions[supportedVersions.length - 1]

let _db: AccountsDB

export const accountsDB = (): AccountsDB => {
	if (!_db) {
		_db = new AccountsDB()
	}
	return _db
}

class AccountsDB {
	public readonly dbPath: string

	private db
	constructor() {
		const cfg = CFG()
		const dbdir = path.join(
			electron.remote.app.getPath(cfg.accountsDBPath.root),
			...cfg.accountsDBPath.path.slice(0, cfg.accountsDBPath.path.length - 1))
		const accountsDBFile = cfg.accountsDBPath.path[cfg.accountsDBPath.path.length - 1]
		this.dbPath = path.join(dbdir, accountsDBFile)
		try {
			fs.mkdirSync(dbdir, {recursive: true})
			console.info(`DB: opening database`, this.dbPath)
			this.db = new sqlite3(this.dbPath, {fileMustExist: false, readonly: false})
			this.db.exec(`
				CREATE TABLE IF NOT EXISTS accounts (
					address TEXT PRIMARY KEY,
					version NUMBER,
					type TEXT,
					name TEXT,
					data TEXT,
					encrypted_data TEXT
				) WITHOUT ROWID;`)
			this.db.exec(`
				CREATE TABLE IF NOT EXISTS password (
					id INTEGER PRIMARY KEY CHECK (id = 0),
					encrypted_password TEXT
				) WITHOUT ROWID;`)
		} catch (e) {
			electron.remote.dialog.showMessageBoxSync({
				type: "error",
				title: "CRASH",
				message:
					`Accounts database: ${this.dbPath} can not be created or opened.\n` +
					`CeloTerminal can not start.\n\n${e}`,
			})
			electron.remote.app.quit()
			throw e
		}
	}

	public close = () => {
		console.info(`DB: closing database`)
		this.db.close()
	}

	public readAccounts = (): Account[] => {
		const rows: {
			address: string
			name: string
			type: string
			version: number
			data: string
			encrypted_data: string
		}[] = this.db.prepare(`SELECT * FROM accounts`).all()
		const accounts: Account[] = rows.filter(
			(r) => supportedVersions.indexOf(r.version) >= 0).map((r) => {
			const base = {
				type: r.type,
				name: r.name,
				address: toChecksumAddress(r.address),
			}
			switch (r.type) {
			case "address-only":
				return base as AddressOnlyAccount
			case "ledger": {
				const ledgerData = JSON.parse(r.data)
				return {
					...base,
					baseDerivationPath: ledgerData.baseDerivationPath,
					derivationPathIndex: ledgerData.derivationPathIndex,
				} as LedgerAccount
			}
			case "local":
				return {
					...base,
					encryptedData: r.encrypted_data,
				} as LocalAccount
			default:
				throw new Error(`Unrecognized account type: ${r.type}.`)
			}
		})
		return accounts
	}

	public addAccount = (a: Account, password?: string): void => {
		let data: string
		let encryptedData: string
		switch (a.type) {
		case "local":
			data = ""
			encryptedData = a.encryptedData
			if (!password) {
				throw new Error(`Password must be provided when adding local accounts.`)
			}
			// Sanity check to make sure encryptedData is decryptable.
			decryptLocalKey(encryptedData, password)
			break
		case "address-only":
			data = ""
			encryptedData = ""
			break
		case "ledger":
			data = JSON.stringify({
				baseDerivationPath: a.baseDerivationPath,
				derivationPathIndex: a.derivationPathIndex,
			})
			encryptedData = ""
			break
		default:
			throw new Error(`Unreachable code.`)
		}

		if (!isValidAddress(a.address)) {
			throw new Error(`Invalid address: ${a.address}.`)
		}
		const address = ensureLeading0x(a.address).toLowerCase()
		this.db.transaction(() => {
			if (password) {
				let pws = this.db.prepare("SELECT * from password").all()
				if (pws.length === 0) {
					const encryptedPassword = encryptAES(password, password)
					this.db
						.prepare(`INSERT INTO password (id, encrypted_password) VALUES (?, ?)`)
						.bind(0, encryptedPassword).run()
					pws = this.db.prepare("SELECT * from password").all()
				}
				if (pws.length !== 1) {
					throw new Error(`Unreachable code.`)
				}
				// make sure it is the same password as the one that is stored.
				try {
					const existingPassword = decryptAES(
						pws[0].encrypted_password, password)
					if (existingPassword !== password) {
						throw new Error()
					}
				} catch (e) {
					throw new Error(`Password does not match with the already existing password for local accounts.`)
				}
			}

			const result = this.db.prepare(
				`INSERT INTO accounts
				(address, version, type, name, data, encrypted_data) VALUES
				(?, ?, ?, ?, ?, ?)`).run(
					address, currentVersion, a.type, a.name, data, encryptedData)
			if (result.changes !== 1) {
				throw new Error(`Unexpected error while writing to the Database.`)
			}
		})()
	}

	public removeAccount = (a: Account) => {
		this.db
			.prepare("DELETE FROM accounts WHERE address = ? AND type = ?")
			.bind(a.address.toLowerCase(), a.type)
			.run()
	}

	public renameAccount = (a: Account, name: string) => {
		this.db
			.prepare("UPDATE accounts SET name = ? WHERE address = ? AND type = ?")
			.bind(name, a.address.toLowerCase(), a.type)
			.run()
	}
}

export interface LocalKey {
	mnemonic?: string
	privateKey: string
}

export const encryptLocalKey = (
	data: LocalKey,
	password: string): string => {
	return encryptAES(JSON.stringify(data), password)
}
export const decryptLocalKey = (
	encryptedData: string,
	password: string): LocalKey => {
	try {
		return JSON.parse(decryptAES(encryptedData, password))
	} catch (e) {
		throw new Error(`Incorrect password, can not decrypt local account.`)
	}
}

const IV_LENGTH = 16
const AES_KEY_LEN = 32
function encryptAES(plainData: string, password: string) {
	const iv = crypto.randomBytes(IV_LENGTH);
	const key = crypto.scryptSync(password, iv, AES_KEY_LEN)
	const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
	return iv.toString('hex') + ":" + cipher.update(plainData).toString('hex') + cipher.final().toString('hex')
}
function decryptAES(encryptedData: string, password: string) {
	const parts = encryptedData.split(":")
	const iv = Buffer.from(parts[0], 'hex')
	const key = crypto.scryptSync(password, iv, AES_KEY_LEN)
	const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
	return Buffer.concat([decipher.update(Buffer.from(parts[1], 'hex')), decipher.final()]).toString()
}