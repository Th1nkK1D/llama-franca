import { mount } from "svelte";
import App from "./app.svelte";
import "@/assets/app.css";

mount(App, { target: document.getElementById("app")! });
