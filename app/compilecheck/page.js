'use client'
import { Portal } from '@headlessui/react'
export default function CompileCheck() {
  return <div>Portal={typeof Portal} Group={typeof Portal?.Group}</div>
}
