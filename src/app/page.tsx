"use client";

import Image from "next/image";
import LogoImg from "./logo.png";
import { Button } from "@/components/ui/button";
import { connect } from "starknetkit";
import { AccountInterface } from "starknet";
import { useEffect, useState } from "react";
import { InjectedConnector } from "starknetkit/injected";

const connectors = [new InjectedConnector({ options: { id: "argentX" } })];

export default function Home() {
  const [wallet, setWallet] = useState<AccountInterface>();

  useEffect(() => {
    // silent connect
    connect({ modalMode: "neverAsk", connectors }).then((res) => {
      if (res.wallet?.account) {
        setWallet(res.wallet.account);
      }
    });
  });

  return (
    <main className="flex flex-col items-center justify-center h-screen space-y-4">
      <Image src={LogoImg} alt="Logo" width={200} height={200} />
      <h1 className="text-4xl font-bold">Welcome to Ankh!</h1>
      <p className="text-lg mt-4">
        Control your L1 account by using a L2 account!
      </p>
      {!wallet && (
        <Button
          onClick={() => {
            connect({
              connectors,
            }).then((res) => {
              if (res.wallet?.account) {
                setWallet(res.wallet.account);
              }
            });
          }}
        >
          Connect Wallet
        </Button>
      )}
      {wallet && (
        <div>
          <h2 className="text-2xl mt-4">Connected Wallet</h2>
          <p className="mt-2">
            Address: <pre>{wallet.address}</pre>
          </p>
        </div>
      )}
    </main>
  );
}
