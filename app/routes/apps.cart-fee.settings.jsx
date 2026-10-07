import {authenticate} from "../shopify.server";
import prisma from "../db.server";

export async function loader({request}) {
  const url = new URL(request.url);
  const context = await authenticate.public.appProxy(request);
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

  let settings;

  try {
    settings = await prisma.cartFeeSettings.findUnique({
      where: {
        shop,
      },
    });
  } catch (error) {
    if (error?.code !== "P2022") {
      throw error;
    }

    const legacySettings = await prisma.$queryRaw`
      SELECT enabled, title, type, value, feeVariantId
      FROM CartFeeSettings
      WHERE shop = ${shop}
      LIMIT 1
    `;
    settings = legacySettings[0] ? {...legacySettings[0], info: ""} : null;
  }

  if (!settings) {
    return Response.json({
      enabled: false,
      title: "Handling fee",
      info: "",
      type: "percentage",
      value: 0,
      feeVariantId: null,
    });
  }

  return Response.json({
    enabled: settings.enabled,
    title: settings.title,
    info: settings.info,
    type: settings.type,
    value: Number(settings.value),
    feeVariantId: settings.feeVariantId,
  });
}