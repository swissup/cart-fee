import {authenticate} from "../shopify.server";
import prisma from "../db.server";

export async function loader({request}) {
  const url = new URL(request.url);

  await authenticate.public.appProxy(request);

  const shop = url.searchParams.get("shop");

  if (!shop) {
    return Response.json(
      {
        enabled: false,
      },
      {
        status: 400,
      },
    );
  }

  const settings = await prisma.cartFeeSettings.findUnique({
    where: {
      shop,
    },
  });

  if (!settings) {
    return Response.json({
      enabled: false,
      title: "Handling fee",
      type: "percentage",
      value: 0,
    });
  }

  return Response.json({
    enabled: settings.enabled,
    title: settings.title,
    type: settings.type,
    value: Number(settings.value),
  });
}