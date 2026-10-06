import {authenticate} from "../shopify.server";
import prisma from "../db.server";

export async function loader({request}) {
  const context = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const requestShop = url.searchParams.get("shop");
  const shop = context.session?.shop;

  if (!shop) {
    return Response.json(
      {
        enabled: false,
      },
      {
        status: 401,
      },
    );
  }

  if (requestShop && requestShop !== shop) {
    return Response.json(
      {
        enabled: false,
      },
      {
        status: 403,
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