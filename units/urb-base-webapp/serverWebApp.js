// @flow

import express from 'express'
import React from 'react'
import path from 'path'
import { JssProvider, SheetsRegistry } from 'react-jss'
import { getFarceResult } from 'found/lib/server'
import ReactDOMServer from 'react-dom/server'
import serialize from 'serialize-javascript'

import { version } from '../_configuration/package'
import UserToken2ServerRendering from '../_configuration/urb-base-server/UserToken2ServerRendering'
import { getSiteInformation } from '../_configuration/urb-base-webapp/siteSettings'
import FetcherServer from './fetcherServer'
import { createResolver, historyMiddlewares, render, routeConfig } from './router'
import Wrapper from './components/Wrapper'

// Read environment
require('dotenv').load()

const envHost = process.env.HOST
if (envHost == null || typeof envHost !== 'string')
  throw new Error('💔  urb-base-webapp requires the environment variable HOST to be set')

const envPort = process.env.PORT
if (envPort == null || typeof envPort !== 'string')
  throw new Error('💔  urb-base-webapp requires the environment variable PORT to be set')

const envPortWebpack = process.env.PORT_WEBPACK
if (envPortWebpack == null || typeof envPortWebpack !== 'string')
  throw new Error('💔  urb-base-webapp requires the environment variable PORT_WEBPACK to be set')

// Create express router
const serverWebApp = express()

async function gatherLocationAndSiteInformation(req: Object, res: Object) {
  let assetsPath

  const siteInformation = await getSiteInformation(req, res)
  if (siteInformation) {
    if (process.env.NODE_ENV === 'production') {
      assetsPath =
        siteInformation.isSiteBuilderDisabled || siteInformation.inEditingMode
          ? // When editing in production, use the assets with the configuration readign code intact (built when cutting a site version)
            `/assets/${version}`
          : // When in production mode, serve the assets compiled by factory's publisher
            `/assets-site/${version}.${siteInformation.configurationAsObject.version}`
    } else {
      // When in development, always go to webpack over http
      const host = process.env.HOST
      const port_webpack = process.env.PORT_WEBPACK
      assetsPath = `http://${envHost}:${envPortWebpack}/${version}`
    }
  } // If siteInformation was null, an error response has already been given

  return { siteInformation, assetsPath }
}

serverWebApp.use(async (req, res) => {
  const fetcher = new FetcherServer(
    `http://localhost:${envPort}/graphql`,
    req.cookies.UserToken1,
    UserToken2ServerRendering,
  )

  const { redirect, status, element } = await getFarceResult({
    url: req.url,
    historyMiddlewares,
    routeConfig,
    resolver: createResolver(fetcher),
    render,
  })

  if (redirect) {
    res.redirect(302, redirect.url)
    return
  }

  const userAgent = req.headers['user-agent']

  const { siteInformation, assetsPath } = await gatherLocationAndSiteInformation(req, res)

  const sheets = new SheetsRegistry()

  const rootHTML = ReactDOMServer.renderToString(
    <JssProvider registry={sheets}>
      <Wrapper userAgent={userAgent}>
        {element}
      </Wrapper>
    </JssProvider>,
  )

  res.render(path.resolve(__dirname, 'html.ejs'), {
    assets_path: assetsPath,
    root_html: rootHTML,
    server_side_styles: sheets.toString(),
    relay_payload: serialize(fetcher, { isJSON: true }),
  })
})

export default serverWebApp
