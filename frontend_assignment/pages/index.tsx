import detectEthereumProvider from "@metamask/detect-provider"
import { Strategy, ZkIdentity } from "@zk-kit/identity"
import { generateMerkleProof, Semaphore } from "@zk-kit/protocols"
import { providers, Contract } from "ethers"
import Head from "next/head"
import React from "react"
import styles from "../styles/Home.module.css"
import { useForm } from "react-hook-form"
import { yupResolver } from "@hookform/resolvers/yup"
import * as yup from "yup"
import Greeter from "artifacts/contracts/Greeters.sol/Greeters.json"

export default function Home() {
    const dataSchema = yup.object().shape({
        name: yup.string().required(),
        age: yup.number().required().positive().integer(),
        address: yup.string().required(),
    })
    const [logs, setLogs] = React.useState("Connect your wallet and greet!")
    // const [isListen, setIsListen] = React.useState("")
    const [greeting, setGreeting] = React.useState("")
    const { register, handleSubmit, formState: { errors }, reset } = useForm({ resolver: yupResolver(dataSchema) })

    const onSubmitHandler = (data: any) => {
        console.log(data);
        reset();
    }

    async function listenGreeting() {
        const provider = new providers.JsonRpcProvider("http://localhost:8545")
        const contract = new Contract("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", Greeter.abi, provider)
        contract.on("NewGreeting", (greeting) => {
            console.log("listen successfully on contract")
            console.log(`${greeting}`)
            setGreeting(`${greeting}`)
        })
    }

    React.useEffect(() => {
        listenGreeting();
    }, [])
    
    async function greet() {
        setLogs("Creating your Semaphore identity...")

        const provider = (await detectEthereumProvider()) as any

        await provider.request({ method: "eth_requestAccounts" })

        const ethersProvider = new providers.Web3Provider(provider)
        const signer = ethersProvider.getSigner()
        const message = await signer.signMessage("Sign this message to create your identity!")

        const identity = new ZkIdentity(Strategy.MESSAGE, message)
        const identityCommitment = identity.genIdentityCommitment()
        const identityCommitments = await (await fetch("./identityCommitments.json")).json()

        const merkleProof = generateMerkleProof(20, BigInt(0), identityCommitments, identityCommitment)

        setLogs("Creating your Semaphore proof...")

        const greeting = "Hello world"

        const witness = Semaphore.genWitness(
            identity.getTrapdoor(),
            identity.getNullifier(),
            merkleProof,
            merkleProof.root,
            greeting
        )

        const { proof, publicSignals } = await Semaphore.genProof(witness, "./semaphore.wasm", "./semaphore_final.zkey")
        const solidityProof = Semaphore.packToSolidityProof(proof)

        const response = await fetch("/api/greet", {
            method: "POST",
            body: JSON.stringify({
                greeting,
                nullifierHash: publicSignals.nullifierHash,
                solidityProof: solidityProof
            })
        })

        if (response.status === 500) {
            const errorMessage = await response.text()

            setLogs(errorMessage)
        } else {
            setLogs("Your anonymous greeting is onchain :)")
            // setIsListen("listen");
        }
    }

    return (
        <div className={styles.container}>
            <Head>
                <title>Greetings</title>
                <meta name="description" content="A simple Next.js/Hardhat privacy application with Semaphore." />
                <link rel="icon" href="/favicon.ico" />
            </Head>

            <main className={styles.main}>
                <h1 className={styles.title}>Greetings</h1>

                <p className={styles.description}>A simple Next.js/Hardhat privacy application with Semaphore.</p>

                <div className={styles.logs}>{logs}</div>

                <div onClick={() => greet()} className={styles.button}>
                    Greet
                </div>

                <form onSubmit={handleSubmit(onSubmitHandler)}>
                    <input placeholder="Name" {...register("name")} />
                    <p>{errors.name?.message}</p>

                    <input placeholder="age" {...register("age")} />
                    <p>{errors.age?.message}</p>

                    <input placeholder="address" {...register("address")} />
                    <p>{errors.address?.message}</p>

                    <button type="submit" className={styles.button}>Button</button>
                </form>

                <div className={styles.logs}>{greeting}</div>
            </main>
        </div>
    )
}
