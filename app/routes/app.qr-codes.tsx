import { redirect, LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  return redirect("/app");
}

export default function QrCodesRoute() {
  return null;
}
